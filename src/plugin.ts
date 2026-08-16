import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { publishRuntimeAddress } from './control.js'
import { HarmonyDraftRuntime } from './draft-runtime.js'
import type { DraftPackage } from './draft-runtime.js'
import { loadHarmonyExtensions } from './extension.js'
import { registerActiveRuntimeRoute, waitForRuntimeChoice } from './installer.js'
import type { HarmonyReloadStatus } from './installer.js'
import {
  beginProfileUpdate,
  beginPluginUpdate,
  currentProfile,
  getPatchInspections,
  getPatchStatuses,
  inspectPatchDependencies,
  packageNameOf,
  prepareModuleReload,
  subscribe,
  watchProfile,
} from './runtime.js'
import type { PatchTargets, ProfileTransaction } from './runtime.js'

const imageAssets = [
  ['/dsh-harmony/assets/harmony-icon-mono.png', new URL('../assets/harmony-icon-mono.png', import.meta.url)],
  ['/dsh-harmony/assets/harmony-preview.png', new URL('../assets/harmony-preview.png', import.meta.url)],
  ['/dsh-harmony/assets/harmony-preview-light.png', new URL('../assets/harmony-preview-light.png', import.meta.url)],
] as const

function loaderPackages(ctx: any): string[] {
  const packages = new Set<string>()
  for (const entry of ctx.loader.entries()) {
    const name = packageNameOf(entry.options.name)
    if (name !== undefined) packages.add(name)
  }
  return [...packages]
}

function profileView(ctx: any) {
  const profile = currentProfile()
  const patchCounts = new Map<string, number>()
  for (const patch of getPatchStatuses()) patchCounts.set(patch.owner, (patchCounts.get(patch.owner) ?? 0) + 1)
  return {
    dir: profile.dir,
    order: profile.order,
    disabled: profile.disabled,
    incompatibilities: profile.incompatibilities,
    plugins: profile.plugins.map(({
      name, version, description, patches, before, after, conflicts, author, contributors, homepage, bugs, license,
    }) => ({
      name,
      version,
      description,
      harmony: patches.length > 0,
      patchCount: patchCounts.get(name) ?? 0,
      before,
      after,
      conflicts,
      author,
      contributors,
      homepage,
      bugs,
      license,
    })),
  }
}

function sendJson(response: any, value: unknown): void {
  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

async function readJson(request: any): Promise<any> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString())
}

function sendError(response: any, error: unknown): void {
  response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
}

function sendPng(request: any, response: any, image: Buffer): void {
  response.writeHead(200, {
    'cache-control': 'public, max-age=3600',
    'content-length': image.length,
    'content-type': 'image/png',
  })
  response.end(request.method === 'HEAD' ? undefined : image)
}

export async function reloadEntries(entries: any[], generation: number): Promise<() => Promise<void>> {
  const plans: Array<{ entry: any; previous: any; previousPlugin: any; next: any }> = []
  const commonjsPackages = new Map<string, () => void>()
  const commonjsRestores = new Set<() => void>()
  const restoreCommonJS = (): void => {
    const errors = []
    for (const restore of [...commonjsRestores].reverse()) {
      try {
        restore()
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, 'dsh-harmony: CommonJS cache rollback failed')
  }
  try {
    for (const entry of entries) {
      const previous = entry.fiber
      if (previous?.uid == null) continue
      const baseUrl = entry.parent.tree.ctx?.baseUrl
      const prepared = prepareModuleReload(entry.options.name, baseUrl, commonjsPackages)
      if (prepared !== undefined) commonjsRestores.add(prepared.restore)
      const imported = prepared?.load === undefined
        ? await entry.parent.tree.import(`${entry.options.name}?dsh-harmony=${generation}`, entry.getOuterStack())
        : prepared.load()
      const next = entry.loader.unwrapExports(imported)
      plans.push({ entry, previous, previousPlugin: previous.runtime.callback, next })
    }
  } catch (error) {
    try {
      restoreCommonJS()
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'dsh-harmony: loader rollback failed')
    }
    throw error
  }

  const restore = async (touched: typeof plans): Promise<void> => {
    const rollbackErrors = []
    try {
      restoreCommonJS()
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError)
    }
    for (const plan of [...touched].reverse()) {
      try {
        if (plan.entry.fiber?.runtime.callback === plan.previousPlugin) continue
        if (plan.entry.fiber !== undefined) await plan.entry._dispose()
        if (plan.entry.fiber === undefined) await plan.entry._start(plan.previousPlugin)
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
    }
    if (rollbackErrors.length > 0) throw new AggregateError(rollbackErrors, 'dsh-harmony: loader rollback failed')
  }

  const touched = []
  try {
    for (const plan of plans) {
      touched.push(plan)
      await plan.entry._dispose(plan.previous)
      await plan.entry._start(plan.next)
    }
  } catch (error) {
    try {
      await restore(touched)
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], 'dsh-harmony: loader rollback failed')
    }
    throw error
  }
  return () => restore(plans)
}

export async function apply(ctx: any): Promise<void> {
  if (process.env.DSH_HARMONY_ACTIVE !== '1') return waitForRuntimeChoice(ctx)

  const profileDir = currentProfile().dir
  const pendingHost = new Set<string>()
  const pendingClient = new Set<string>()
  const stagedProviders = new Set<string>()
  let pendingGeneration = 0
  let clientModules: any
  let queued = false
  let syncQueued = false
  let initialSync = true
  let initializing = true
  let updateTail = Promise.resolve()
  const reloadingEntries = new Set<any>()
  let incompatibilitySignature = ''
  let reloadSequence = 0
  let reloadStatus: HarmonyReloadStatus = { sequence: 0, state: 'idle' }

  registerActiveRuntimeRoute(ctx, () => reloadStatus)

  const warnIncompatibilities = (profile: ProfileTransaction['profile']): void => {
    const signature = JSON.stringify(profile.incompatibilities)
    if (signature === incompatibilitySignature) return
    incompatibilitySignature = signature
    for (const item of profile.incompatibilities) {
      ctx.logger.warn?.(
        `dsh-harmony: ${JSON.stringify(item.declaredBy)} declares ${JSON.stringify(item.conflictsWith)} incompatible; both remain loaded`,
      )
    }
  }

  const enqueueUpdate = <T>(task: () => Promise<T>): Promise<T> => {
    const result = updateTail.then(async () => {
      const sequence = ++reloadSequence
      reloadStatus = { sequence, state: 'reloading' }
      try {
        const value = await task()
        reloadStatus = { sequence, state: 'succeeded' }
        return value
      } catch (error) {
        reloadStatus = {
          sequence,
          state: 'failed',
          error: error instanceof Error ? error.message : String(error),
        }
        throw error
      }
    })
    updateTail = result.then(() => undefined, () => undefined)
    return result
  }

  const hostEntries = (targets: PatchTargets): any[] => [...ctx.loader.entries()].filter((entry: any) => {
    const packageName = packageNameOf(entry.options.name)
    return packageName !== undefined && targets.has(packageName)
      && [...targets.get(packageName)!].some(file => file !== 'lib/client.js')
  })
  const reload = async (entries: any[], nextGeneration: number): Promise<() => Promise<void>> => {
    for (const entry of entries) reloadingEntries.add(entry)
    try {
      const restore = await reloadEntries(entries, nextGeneration)
      return async () => {
        for (const entry of entries) reloadingEntries.add(entry)
        try {
          await restore()
        } finally {
          for (const entry of entries) reloadingEntries.delete(entry)
        }
      }
    } finally {
      for (const entry of entries) reloadingEntries.delete(entry)
    }
  }
  const applyTransaction = async (transaction: ProfileTransaction): Promise<void> => {
    let restoreEntries: (() => Promise<void>) | undefined
    const rebuiltClients: string[] = []
    try {
      restoreEntries = await reload(hostEntries(transaction.targets), transaction.generation)
      for (const [packageName, files] of transaction.targets) {
        if (!files.has('lib/client.js') || clientModules === undefined) continue
        clientModules.rebuilt(packageName)
        rebuiltClients.push(packageName)
      }
      transaction.commit()
      warnIncompatibilities(transaction.profile)
    } catch (error) {
      const rollbackErrors = []
      try {
        await restoreEntries?.()
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
      try {
        transaction.rollback()
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError)
      }
      for (const packageName of rebuiltClients.reverse()) {
        try {
          clientModules.rebuilt(packageName)
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError)
        }
      }
      if (rollbackErrors.length > 0) throw new AggregateError([error, ...rollbackErrors], 'dsh-harmony: transaction rollback failed')
      throw error
    }
  }

  const patchProviders = (): string[] => loaderPackages(ctx).filter(name => !stagedProviders.has(name))
  const setProviderStaged = async (name: string, staged: boolean): Promise<void> => {
    const wasStaged = stagedProviders.has(name)
    if (staged) stagedProviders.add(name)
    else stagedProviders.delete(name)
    try {
      await enqueueUpdate(() => applyTransaction(beginPluginUpdate(patchProviders(), true)))
    } catch (error) {
      if (wasStaged) stagedProviders.add(name)
      else stagedProviders.delete(name)
      throw error
    }
  }

  ctx.inject(['clientModules'], (clientCtx: any) => {
    clientModules = clientCtx.clientModules
    return () => { clientModules = undefined }
  })

  const draftRuntime = new HarmonyDraftRuntime({
    profileDir,
    setProviderStaged,
    async ensureLoaderEntry(name) {
      const entries = [...ctx.loader.entries()].filter((entry: any) => packageNameOf(entry.options.name) === name)
      if (entries.length > 1) throw new Error(`dsh-harmony: Draft ${JSON.stringify(name)} has multiple Loader entries`)
      if (entries.length === 1) return { id: entries[0].id, created: false }
      return { id: await ctx.loader.create({ name }), created: true }
    },
    removeLoaderEntry: id => ctx.loader.remove(id),
    clientGraph() {
      if (clientModules === undefined) throw new Error('dsh-harmony: client module graph is unavailable')
      return clientModules.graph()
    },
    async waitForClientEntry(name) {
      if (clientModules === undefined) throw new Error('dsh-harmony: client module graph is unavailable')
      const current = clientModules.graph()
      if (current.entries.some((entry: { id: string }) => entry.id === name)) return current
      return await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          stop()
          reject(new Error(`dsh-harmony: Draft ${JSON.stringify(name)} did not enter the client graph`))
        }, 10_000)
        const stop = clientModules.onGraphChanged(() => {
          const graph = clientModules.graph()
          if (!graph.entries.some((entry: { id: string }) => entry.id === name)) return
          clearTimeout(timeout)
          stop()
          resolve(graph)
        })
      })
    },
    async applyBuild(name) {
      return enqueueUpdate(async () => {
        const transaction = beginPluginUpdate(patchProviders(), true)
        const files = transaction.targets.get(name) ?? new Set<string>()
        files.add('lib/index.js')
        files.add('lib/client.js')
        transaction.targets.set(name, files)
        await applyTransaction(transaction)
        if (clientModules === undefined) throw new Error('dsh-harmony: client module graph is unavailable')
        return clientModules.graph()
      })
    },
  })
  ctx.provide('harmony', {
    binEntry: fileURLToPath(new URL('./bin.js', import.meta.url)),
    profileDir,
    inspect(input: { package?: string; file?: string } = {}) {
      return {
        patches: getPatchStatuses(),
        targets: getPatchInspections(input.package, input.file),
      }
    },
    inspectDependencies: (owner: string) => inspectPatchDependencies(owner),
    prepareDraft: (input: DraftPackage) => draftRuntime.prepareDraft(input),
  })
  ctx.effect(() => () => draftRuntime.dispose(), 'dsh-harmony: Draft runtime')
  let disposeExtensions: (() => Promise<void>) | undefined
  let extensionsDisposed = false
  const extensionsReady = loadHarmonyExtensions(ctx, profileDir).then(async dispose => {
    if (extensionsDisposed) await dispose()
    else disposeExtensions = dispose
  })
  ctx.effect(() => async () => {
    extensionsDisposed = true
    await extensionsReady
    await disposeExtensions?.()
  }, 'dsh-harmony: extensions')

  ctx.inject(['webServer'], (webCtx: any) => {
    const update = (input: () => { order?: string[]; disabled?: string[] }): Promise<void> => enqueueUpdate(
      () => applyTransaction(beginProfileUpdate(input())),
    )
    const dispose = [webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-harmony/order',
      async handler(request: any, response: any) {
        if (request.method === 'GET') return sendJson(response, profileView(ctx))
        if (request.method === 'POST') {
          try {
            const { order } = await readJson(request) as { order: string[] }
            await update(() => ({ order }))
            return sendJson(response, profileView(ctx))
          } catch (error) {
            return sendError(response, error)
          }
        }
        response.writeHead(405)
        response.end()
      },
    }), webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-harmony/patches',
      async handler(request: any, response: any) {
        if (request.method === 'GET') return sendJson(response, { patches: getPatchStatuses() })
        if (request.method === 'POST') {
          try {
            const { key, owner, enabled } = await readJson(request) as { key?: string; owner?: string; enabled: boolean }
            await update(() => {
              const disabled = new Set(currentProfile().disabled)
              if (owner !== undefined) {
                const providerKey = `${owner}/*`
                if (enabled) {
                  disabled.delete(providerKey)
                  for (const patch of getPatchStatuses()) if (patch.owner === owner) disabled.delete(patch.key)
                } else {
                  for (const patch of getPatchStatuses()) if (patch.owner === owner) disabled.delete(patch.key)
                  disabled.add(providerKey)
                }
              } else if (key !== undefined) {
                if (enabled) disabled.delete(key)
                else disabled.add(key)
              }
              return { disabled: [...disabled] }
            })
            return sendJson(response, { patches: getPatchStatuses() })
          } catch (error) {
            return sendError(response, error)
          }
        }
        response.writeHead(405)
        response.end()
      },
    }), webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-harmony/inspect',
      handler(request: any, response: any) {
        if (request.method !== 'GET') {
          response.writeHead(405)
          return response.end()
        }
        const url = new URL(request.url, 'http://localhost')
        return sendJson(response, {
          inspections: getPatchInspections(url.searchParams.get('package') ?? undefined, url.searchParams.get('file') ?? undefined),
        })
      },
    })]
    for (const [path, url] of imageAssets) {
      const image = readFileSync(url)
      dispose.push(webCtx.webServer.register({
        kind: 'exact',
        path,
        handler(request: any, response: any) {
          if (request.method === 'GET' || request.method === 'HEAD') return sendPng(request, response, image)
          response.writeHead(405)
          response.end()
        },
      }))
    }
    dispose.push(publishRuntimeAddress(currentProfile().dir, webCtx.webServer.host, webCtx.webServer.port))
    return () => dispose.forEach(stop => stop())
  })

  const synchronizeLoader = (): void => {
    if (syncQueued) return
    syncQueued = true
    setImmediate(() => {
      void enqueueUpdate(async () => {
        syncQueued = false
        const transaction = beginPluginUpdate(patchProviders(), initialSync)
        initialSync = false
        await applyTransaction(transaction)
      }).catch(error => ctx.logger.error(error)).finally(() => {
        initializing = false
      })
    })
  }
  ctx.effect(() => watchProfile(synchronizeLoader, (error) => ctx.logger.error(error)), 'dsh-harmony: profile order watch')
  ctx.on('internal/plugin', (fiber: any) => {
    if (!reloadingEntries.has(fiber.entry)) synchronizeLoader()
  })

  ctx.effect(() => subscribe((targets, generation) => {
    if (initializing) return
    pendingGeneration = generation
    for (const [target, files] of targets) {
      if (files.has('lib/client.js')) pendingClient.add(target)
      if ([...files].some(file => file !== 'lib/client.js')) pendingHost.add(target)
    }
    if (queued) return
    queued = true
    setImmediate(() => {
      void enqueueUpdate(async () => {
        queued = false
        const clientTargets = [...pendingClient]
        const hostTargets = new Set(pendingHost)
        const generation = pendingGeneration
        pendingClient.clear()
        pendingHost.clear()
        const entries = [...ctx.loader.entries()].filter((entry: any) => {
          const packageName = packageNameOf(entry.options.name)
          return packageName !== undefined && hostTargets.has(packageName)
        })
        await reload(entries, generation)
        for (const target of clientTargets) clientModules?.rebuilt(target)
      }).catch(error => ctx.logger.error(error))
    })
  }), 'dsh-harmony: patch reload')
  synchronizeLoader()
  await extensionsReady
}

export const inject = ['appExit']
