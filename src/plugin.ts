import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import type { ClientModuleRegistry } from '@deepseek-ai/dsh-client-modules'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'
import type { Context, Fiber } from '@deepseek-ai/cordis'
import type { Loader } from '@deepseek-ai/cordis-plugin-loader'
import { publishRuntimeAddress } from './control.js'
import { loadHarmonyExtensions } from './extension.js'
import { registerActiveRuntimeRoute, waitForRuntimeChoice } from './installer.js'
import type { HarmonyReloadStatus } from './installer.js'
import type { HarmonyProfileUpdate, HarmonyProfileUpdateResult, HarmonyProfileView } from './index.js'
import { createHarmonyProfileView, prepareHarmonyProfileUpdate } from './profile.js'
import {
  beginProfileUpdate,
  beginPluginUpdate,
  currentProfile,
  getPatchInspections,
  getPatchStatuses,
  inspectPatchDependencies,
  inspectPatchTargets,
  packageNameOf,
  prepareModuleReload,
  subscribe,
  subscribePatchStatuses,
  watchProfile,
} from './runtime.js'
import type { PatchTargets, ProfileTransaction } from './runtime.js'

const imageAssets = [
  ['/dsh-harmony/assets/harmony-icon-mono.png', new URL('../assets/harmony-icon-mono.png', import.meta.url), 'image/png'],
  ['/dsh-harmony/assets/harmony-preview.webp', new URL('../assets/harmony-preview.webp', import.meta.url), 'image/webp'],
  ['/dsh-harmony/assets/harmony-preview-light.webp', new URL('../assets/harmony-preview-light.webp', import.meta.url), 'image/webp'],
] as const

interface ReloadFiber {
  uid: number | null
  runtime: { callback: unknown } | null
}

interface ReloadableEntry {
  options: { name: string }
  fiber?: ReloadFiber
  parent: { tree: { ctx?: { baseUrl?: string }; import(name: string, getOuterStack?: () => string[]): unknown } }
  loader: { unwrapExports(value: unknown): unknown }
  getOuterStack(): string[]
  _dispose(fiber?: ReloadFiber): Promise<void>
  _start(plugin: unknown): Promise<void>
}

function loaderPackages(ctx: Context): string[] {
  const packages = new Set<string>()
  for (const entry of ctx.loader.entries()) {
    const name = packageNameOf(entry.options.name)
    if (name !== undefined) packages.add(name)
  }
  return [...packages]
}

function profileView(): HarmonyProfileView {
  const profile = currentProfile()
  const patchCounts = new Map(profile.plugins.map(plugin => [plugin.name, 0]))
  for (const patch of getPatchStatuses()) patchCounts.set(patch.owner, (patchCounts.get(patch.owner) ?? 0) + 1)
  return createHarmonyProfileView(profile, patchCounts)
}

function sendJson(response: ServerResponse, value: unknown): void {
  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString())
}

function sendError(response: ServerResponse, error: unknown): void {
  response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
}

function sendAsset(request: IncomingMessage, response: ServerResponse, image: Buffer, contentType: string): void {
  response.writeHead(200, {
    'cache-control': 'public, max-age=3600',
    'content-length': image.length,
    'content-type': contentType,
  })
  response.end(request.method === 'HEAD' ? undefined : image)
}

export async function reloadEntries(entries: ReloadableEntry[], generation: number): Promise<() => Promise<void>> {
  const plans: Array<{ entry: ReloadableEntry; previous: ReloadFiber; previousPlugin: unknown; next: unknown }> = []
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
      if (previous?.uid == null || previous.runtime === null) continue
      const baseUrl = entry.parent.tree.ctx?.baseUrl
      const prepared = prepareModuleReload(entry.options.name, baseUrl, commonjsPackages)
      if (prepared !== undefined) commonjsRestores.add(prepared.restore)
      const imported = prepared?.load === undefined
        ? await entry.parent.tree.import(`${entry.options.name}?dsh-harmony=${generation}`, entry.getOuterStack)
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
        if (plan.entry.fiber?.runtime?.callback === plan.previousPlugin) continue
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

export async function apply(ctx: Context): Promise<void> {
  if (process.env.DSH_HARMONY_ACTIVE !== '1') return waitForRuntimeChoice(ctx)

  const profileDir = currentProfile().dir
  const pendingHost = new Set<string>()
  const pendingClient = new Set<string>()
  let pendingGeneration = 0
  let clientModules: ClientModuleRegistry | undefined
  let queued = false
  let syncQueued = false
  let initialSync = true
  let initializing = true
  let updateTail = Promise.resolve()
  const reloadingEntries = new Set<object>()
  let incompatibilitySignature = ''
  let patchFailures = new Map<string, string>()
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

  const warnPatchFailures = (): void => {
    const failures = getPatchStatuses().filter(patch => patch.state === 'failed')
    const next = new Map(failures.map(patch => [patch.key, patch.error ?? 'unknown error']))
    for (const patch of failures) {
      if (patchFailures.get(patch.key) === next.get(patch.key)) continue
      ctx.logger.warn?.(`dsh-harmony: skipped Patch ${JSON.stringify(patch.key)}: ${patch.error ?? 'unknown error'}`)
    }
    patchFailures = next
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

  const hostEntries = (targets: PatchTargets): ReloadableEntry[] => [...ctx.loader.entries()].filter((entry) => {
    const packageName = packageNameOf(entry.options.name)
    return packageName !== undefined && targets.has(packageName)
      && [...targets.get(packageName)!].some(file => file !== 'lib/client.js')
  }) as unknown as ReloadableEntry[]
  const reload = async (entries: ReloadableEntry[], nextGeneration: number): Promise<() => Promise<void>> => {
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
    const modules = clientModules
    try {
      inspectPatchTargets(true)
      restoreEntries = await reload(hostEntries(transaction.targets), transaction.generation)
      for (const [packageName, files] of transaction.targets) {
        if (!files.has('lib/client.js') || modules === undefined) continue
        modules.rebuilt(packageName)
        rebuiltClients.push(packageName)
      }
      transaction.commit()
      warnIncompatibilities(transaction.profile)
      warnPatchFailures()
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
          modules?.rebuilt(packageName)
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError)
        }
      }
      if (rollbackErrors.length > 0) throw new AggregateError([error, ...rollbackErrors], 'dsh-harmony: transaction rollback failed')
      throw error
    }
  }

  const refreshPatches = (force = true, reload?: string): Promise<void> => enqueueUpdate(async () => {
    const transaction = beginPluginUpdate(loaderPackages(ctx), force)
    if (reload !== undefined) {
      const files = transaction.targets.get(reload) ?? new Set<string>()
      files.add('lib/index.js')
      files.add('lib/client.js')
      transaction.targets.set(reload, files)
    }
    await applyTransaction(transaction)
  })

  const updateProfile = async (input: () => HarmonyProfileUpdate): Promise<HarmonyProfileUpdateResult> => {
    const generation = await enqueueUpdate(async () => {
      const candidate = prepareHarmonyProfileUpdate(currentProfile(), input())
      const transaction = beginProfileUpdate({ order: candidate.order, disabled: candidate.disabled })
      await applyTransaction(transaction)
      return transaction.generation
    })
    return {
      profile: profileView(),
      generation,
      reload: { ...reloadStatus },
      ...(clientModules === undefined ? {} : { clientGraphRev: clientModules.graph().rev }),
    }
  }

  ctx.inject(['clientModules'], (clientCtx) => {
    clientModules = clientCtx.clientModules
    return () => { clientModules = undefined }
  })

  ctx.provide('harmony', {
    binEntry: fileURLToPath(new URL('./bin.js', import.meta.url)),
    profileDir,
    profile: profileView,
    updateProfile: (input: HarmonyProfileUpdate) => updateProfile(() => input),
    inspect(input: { package?: string; file?: string } = {}) {
      return {
        patches: getPatchStatuses(),
        targets: getPatchInspections(input.package, input.file),
      }
    },
    inspectDependencies: (owner: string) => inspectPatchDependencies(owner),
    reloadPlugin: (name: string) => refreshPatches(true, name),
  })
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

  ctx.inject(['webServer'], (webCtx) => {
    const dispose = [webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-harmony/order',
      async handler(request: IncomingMessage, response: ServerResponse) {
        if (request.method === 'GET') return sendJson(response, profileView())
        if (request.method === 'POST') {
          try {
            const { order } = await readJson(request) as { order: string[] }
            const result = await updateProfile(() => ({ order }))
            return sendJson(response, result.profile)
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
      async handler(request: IncomingMessage, response: ServerResponse) {
        if (request.method === 'GET') return sendJson(response, { patches: getPatchStatuses() })
        if (request.method === 'POST') {
          try {
            const { key, owner, enabled } = await readJson(request) as { key?: string; owner?: string; enabled: boolean }
            await updateProfile(() => {
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
      handler(request: IncomingMessage, response: ServerResponse) {
        if (request.method !== 'GET') {
          response.writeHead(405)
          response.end()
          return
        }
        const url = new URL(request.url ?? '/', 'http://localhost')
        return sendJson(response, {
          inspections: getPatchInspections(url.searchParams.get('package') ?? undefined, url.searchParams.get('file') ?? undefined),
        })
      },
    })]
    for (const [path, url, contentType] of imageAssets) {
      const image = readFileSync(url)
      dispose.push(webCtx.webServer.register({
        kind: 'exact',
        path,
        handler(request: IncomingMessage, response: ServerResponse) {
          if (request.method === 'GET' || request.method === 'HEAD') return sendAsset(request, response, image, contentType)
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
      syncQueued = false
      const force = initialSync
      initialSync = false
      void refreshPatches(force).catch(error => ctx.logger.error(error)).finally(() => {
        initializing = false
      })
    })
  }
  ctx.effect(() => watchProfile(synchronizeLoader, (error) => ctx.logger.error(error)), 'dsh-harmony: profile order watch')
  ctx.effect(() => subscribePatchStatuses(warnPatchFailures), 'dsh-harmony: Patch failure warnings')
  ctx.on('internal/plugin', (fiber: Fiber) => {
    if (fiber.entry === undefined || !reloadingEntries.has(fiber.entry)) synchronizeLoader()
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
        const entries = [...ctx.loader.entries()].filter((entry) => {
          const packageName = packageNameOf(entry.options.name)
          return packageName !== undefined && hostTargets.has(packageName)
        }) as unknown as ReloadableEntry[]
        await reload(entries, generation)
        for (const target of clientTargets) clientModules?.rebuilt(target)
      }).catch(error => ctx.logger.error(error))
    })
  }), 'dsh-harmony: patch reload')
  synchronizeLoader()
  await extensionsReady
}

export const inject = ['appExit']
