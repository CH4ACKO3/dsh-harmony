import { randomBytes } from 'node:crypto'
import { channel } from 'node:diagnostics_channel'
import { readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { ClientModuleRegistry } from '@deepseek-ai/dsh-client-modules'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'
import type { Context, Fiber } from '@deepseek-ai/cordis'
import type { Loader } from '@deepseek-ai/cordis-plugin-loader'
import { publishRuntimeAddress } from './control.js'
import { readJson, RequestBodyTooLargeError } from './http.js'
import { registerActiveRuntimeRoute, waitForRuntimeChoice } from './installer.js'
import type { HarmonyReloadStatus } from './installer.js'
import type { HarmonyProfileUpdate, HarmonyProfileView, HarmonyRuntimeProfileUpdateResult } from './index.js'
import { createHarmonyProfileView, prepareHarmonyProfileUpdate } from './profile.js'
import {
  beginProfileUpdate,
  beginPluginUpdate,
  currentProfile,
  getPatchInspections,
  getPatchOrderViolations,
  getPatchStatuses,
  inspectPatchTargets,
  packageNameOf,
  prepareModuleReload,
  subscribe,
  subscribePatchStatuses,
  watchProfile,
} from './runtime.js'
import type { PatchTargets, ProfileTransaction } from './runtime.js'
import type { HarmonyActivePlugin } from './compatibility.js'

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

interface HarmonyLoadPerformance {
  operation: 'startup' | 'plugin-update' | 'profile-update' | 'manual-reload'
  generation?: number
  status: 'succeeded' | 'failed'
  targetPackages: number
  targetFiles: number
  prepareMs: number
  transformMs: number
  hostReloadMs: number
  clientRebuildMs: number
  totalMs: number
  error?: string
}

interface HarmonyLoadProbe {
  operation: HarmonyLoadPerformance['operation']
  started: bigint
  prepareMs: number
  transformMs: number
  hostReloadMs: number
  clientRebuildMs: number
}

const loadPerformanceChannel = channel('dsh-harmony:load')

function elapsedMilliseconds(started: bigint): number {
  return Math.round(Number(process.hrtime.bigint() - started) / 1e3) / 1e3
}

function loaderInventory(ctx: Context): { packages: string[]; active: HarmonyActivePlugin[] } {
  const packages = new Set<string>()
  const active = new Map<string, string[]>()
  for (const entry of ctx.loader.entries()) {
    const name = packageNameOf(entry.options.name)
    if (name === undefined) continue
    packages.add(name)
    if (entry.options.group || entry.disabled) continue
    const entryIds = active.get(name) ?? []
    entryIds.push(entry.id)
    active.set(name, entryIds)
  }
  return {
    packages: [...packages],
    active: [...active].map(([name, entryIds]) => ({ name, entryIds })),
  }
}

function profileView(): HarmonyProfileView {
  const profile = currentProfile()
  const patchCounts = new Map(profile.plugins.map(plugin => [plugin.name, 0]))
  for (const patch of getPatchStatuses()) patchCounts.set(patch.owner, (patchCounts.get(patch.owner) ?? 0) + 1)
  return createHarmonyProfileView(profile, patchCounts, getPatchOrderViolations())
}

function sendJson(response: ServerResponse, value: unknown): void {
  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

function sendError(response: ServerResponse, error: unknown): void {
  response.writeHead(error instanceof RequestBodyTooLargeError ? 413 : 500, {
    'content-type': 'application/json; charset=utf-8',
  })
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
  let warnedCompatibility = new Set<string>()
  let patchFailures = new Map<string, string>()
  let reloadSequence = 0
  let reloadStatus: HarmonyReloadStatus = { sequence: 0, state: 'idle' }
  const logPerformance = process.env.DSH_HARMONY_PERF === '1'

  const startLoadProbe = (operation: HarmonyLoadProbe['operation']): HarmonyLoadProbe | undefined => {
    if (!logPerformance && !loadPerformanceChannel.hasSubscribers) return undefined
    return {
      operation,
      started: process.hrtime.bigint(),
      prepareMs: 0,
      transformMs: 0,
      hostReloadMs: 0,
      clientRebuildMs: 0,
    }
  }

  const finishLoadProbe = (
    probe: HarmonyLoadProbe | undefined,
    transaction: ProfileTransaction | undefined,
    status: HarmonyLoadPerformance['status'],
    error?: unknown,
  ): void => {
    if (probe === undefined) return
    const record: HarmonyLoadPerformance = {
      operation: probe.operation,
      generation: transaction?.generation,
      status,
      targetPackages: transaction?.targets.size ?? 0,
      targetFiles: transaction === undefined
        ? 0
        : [...transaction.targets.values()].reduce((count, files) => count + files.size, 0),
      prepareMs: probe.prepareMs,
      transformMs: probe.transformMs,
      hostReloadMs: probe.hostReloadMs,
      clientRebuildMs: probe.clientRebuildMs,
      totalMs: elapsedMilliseconds(probe.started),
      ...(error === undefined ? {} : { error: error instanceof Error ? error.message : String(error) }),
    }
    loadPerformanceChannel.publish(record)
    if (logPerformance) ctx.logger.info?.(`dsh-harmony: performance ${JSON.stringify(record)}`)
  }

  registerActiveRuntimeRoute(ctx, () => reloadStatus)

  const warnCompatibility = (profile: ProfileTransaction['profile']): void => {
    const next = new Set<string>()
    for (const item of profile.compatibility) {
      if (item.kind === 'integration') continue
      const key = JSON.stringify(item)
      next.add(key)
      if (warnedCompatibility.has(key)) continue
      ctx.logger.warn?.(item.kind === 'conflict'
        ? `dsh-harmony: ${item.left.package}@${item.left.version} conflicts with ${item.right.package}@${item.right.version}; both remain enabled`
        : `dsh-harmony: ${item.owner.package}@${item.owner.version} requires ${item.target.package}@${item.target.range} (${item.reason})`)
    }
    warnedCompatibility = next
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
  const applyTransaction = async (transaction: ProfileTransaction, probe?: HarmonyLoadProbe): Promise<void> => {
    let restoreEntries: (() => Promise<void>) | undefined
    const rebuiltClients: string[] = []
    const modules = clientModules
    let failure: unknown
    try {
      const transformStarted = probe === undefined ? undefined : process.hrtime.bigint()
      try {
        inspectPatchTargets()
      } finally {
        if (probe !== undefined && transformStarted !== undefined) probe.transformMs = elapsedMilliseconds(transformStarted)
      }
      const hostReloadStarted = probe === undefined ? undefined : process.hrtime.bigint()
      try {
        restoreEntries = await reload(hostEntries(transaction.targets), transaction.generation)
      } finally {
        if (probe !== undefined && hostReloadStarted !== undefined) probe.hostReloadMs = elapsedMilliseconds(hostReloadStarted)
      }
      const clientRebuildStarted = probe === undefined ? undefined : process.hrtime.bigint()
      try {
        for (const [packageName, files] of transaction.targets) {
          if (!files.has('lib/client.js') || modules === undefined) continue
          modules.rebuilt(packageName)
          rebuiltClients.push(packageName)
        }
      } finally {
        if (probe !== undefined && clientRebuildStarted !== undefined) {
          probe.clientRebuildMs = elapsedMilliseconds(clientRebuildStarted)
        }
      }
      transaction.commit()
      warnCompatibility(transaction.profile)
      warnPatchFailures()
    } catch (error) {
      failure = error
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
    } finally {
      finishLoadProbe(probe, transaction, failure === undefined ? 'succeeded' : 'failed', failure)
    }
  }

  const runTransaction = async (
    operation: HarmonyLoadProbe['operation'],
    prepare: () => ProfileTransaction,
  ): Promise<ProfileTransaction> => {
    const probe = startLoadProbe(operation)
    const prepareStarted = probe === undefined ? undefined : process.hrtime.bigint()
    let transaction: ProfileTransaction | undefined
    try {
      transaction = prepare()
    } catch (error) {
      if (probe !== undefined && prepareStarted !== undefined) probe.prepareMs = elapsedMilliseconds(prepareStarted)
      finishLoadProbe(probe, undefined, 'failed', error)
      throw error
    }
    if (probe !== undefined && prepareStarted !== undefined) probe.prepareMs = elapsedMilliseconds(prepareStarted)
    await applyTransaction(transaction, probe)
    return transaction
  }

  const refreshPatches = (force = true, reload?: string): Promise<void> => enqueueUpdate(async () => {
    await runTransaction(reload !== undefined ? 'manual-reload' : initializing ? 'startup' : 'plugin-update', () => {
      const inventory = loaderInventory(ctx)
      const transaction = beginPluginUpdate(inventory.packages, force, inventory.active)
      if (reload !== undefined) {
        const files = transaction.targets.get(reload) ?? new Set<string>()
        files.add('lib/index.js')
        files.add('lib/client.js')
        transaction.targets.set(reload, files)
      }
      return transaction
    })
  })

  const updateProfile = async (input: () => HarmonyProfileUpdate): Promise<HarmonyRuntimeProfileUpdateResult> => {
    const generation = await enqueueUpdate(async () => {
      const transaction = await runTransaction('profile-update', () => {
        const requested = input()
        const candidate = prepareHarmonyProfileUpdate(currentProfile(), requested)
        return beginProfileUpdate({
          ...(requested.order === undefined ? {} : { order: candidate.order }),
          ...(requested.patchOrder === undefined ? {} : { patchOrder: candidate.patchOrder }),
          ...(requested.disabled === undefined ? {} : { disabled: candidate.disabled }),
        })
      })
      return transaction.generation
    })
    return {
      mode: 'live',
      profile: profileView(),
      generation,
      reload: { ...reloadStatus },
    }
  }

  const updatePatch = async (input: { key?: string; owner?: string; enabled?: unknown }) => {
    const { key, owner, enabled } = input
    if (typeof enabled !== 'boolean' || (key === undefined) === (owner === undefined)) {
      throw new TypeError('dsh-harmony: patch update requires enabled and exactly one of key or owner')
    }
    const patches = getPatchStatuses()
    if (key !== undefined && !patches.some(patch => patch.key === key)) {
      throw new Error(`dsh-harmony: unknown Patch ${JSON.stringify(key)}`)
    }
    if (owner !== undefined && !patches.some(patch => patch.owner === owner)) {
      throw new Error(`dsh-harmony: unknown Provider ${JSON.stringify(owner)}`)
    }
    const result = await updateProfile(() => {
      const disabled = new Set(currentProfile().disabled)
      if (owner !== undefined) {
        const providerKey = `${owner}/*`
        if (enabled) disabled.delete(providerKey)
        else disabled.add(providerKey)
      } else {
        if (enabled) disabled.delete(key!)
        else disabled.add(key!)
      }
      return { disabled: [...disabled] }
    })
    return { result, patches: getPatchStatuses() }
  }

  const operations = {
    status: () => ({
      profile: profileView(),
      patches: getPatchStatuses(),
      reload: { ...reloadStatus },
    }),
    updateProfile: (input: HarmonyProfileUpdate) => updateProfile(() => input),
    updatePatch,
    inspect: (input: { package?: string; file?: string } = {}) => ({
      patches: getPatchStatuses(),
      targets: getPatchInspections(input.package, input.file),
    }),
    reload: async (provider?: string) => {
      if (provider !== undefined && !loaderInventory(ctx).packages.includes(provider)) {
        throw new Error(`dsh-harmony: unknown plugin ${JSON.stringify(provider)}`)
      }
      await refreshPatches(true, provider)
      return operations.status()
    },
  }

  ctx.inject(['clientModules'], (clientCtx) => {
    clientModules = clientCtx.clientModules
    return () => { clientModules = undefined }
  })

  ctx.provide('harmony', {
    profile: profileView,
    updateProfile: operations.updateProfile,
    inspect: operations.inspect,
  })

  const controlToken = randomBytes(32).toString('hex')
  const controlServer = createServer((request, response) => {
    void (async () => {
      if (request.headers.authorization !== `Bearer ${controlToken}`) {
        response.writeHead(401)
        response.end()
        return
      }
      const path = new URL(request.url ?? '/', 'http://localhost').pathname
      if (path === '/dsh-harmony/status' && request.method === 'GET') {
        return sendJson(response, operations.status())
      }
      if (path === '/dsh-harmony/profile' && request.method === 'POST') {
        const input = await readJson<HarmonyProfileUpdate>(request)
        return sendJson(response, await operations.updateProfile(input))
      }
      if (path === '/dsh-harmony/patches' && request.method === 'POST') {
        return sendJson(response, await operations.updatePatch(await readJson<{
          key?: string
          owner?: string
          enabled?: unknown
        }>(request)))
      }
      if (path === '/dsh-harmony/reload' && request.method === 'POST') {
        const { provider } = await readJson<{ provider?: unknown }>(request)
        if (provider !== undefined && typeof provider !== 'string') {
          throw new TypeError('dsh-harmony: reload provider must be a string')
        }
        return sendJson(response, await operations.reload(provider))
      }
      if (path === '/dsh-harmony/inspect' && request.method === 'GET') {
        const url = new URL(request.url ?? '/', 'http://localhost')
        return sendJson(response, operations.inspect({
          package: url.searchParams.get('package') ?? undefined,
          file: url.searchParams.get('file') ?? undefined,
        }))
      }
      response.writeHead(404)
      response.end()
    })().catch(error => sendError(response, error))
  })
  controlServer.unref()
  let disposeRuntimeAddress: (() => void) | undefined
  const controlReady = new Promise<void>((resolve, reject) => {
    controlServer.once('error', reject)
    controlServer.listen(0, '127.0.0.1', () => {
      controlServer.off('error', reject)
      const port = (controlServer.address() as AddressInfo).port
      disposeRuntimeAddress = publishRuntimeAddress(profileDir, `http://127.0.0.1:${port}`, controlToken)
      resolve()
    })
  })
  ctx.effect(() => async () => {
    disposeRuntimeAddress?.()
    if (!controlServer.listening) return
    await new Promise<void>((resolve, reject) => controlServer.close(error => error ? reject(error) : resolve()))
  }, 'dsh-harmony: runtime control')

  ctx.inject(['webServer'], (webCtx) => {
    const dispose = [webCtx.webServer.register({
      kind: 'exact',
      path: '/dsh-harmony/profile',
      async handler(request: IncomingMessage, response: ServerResponse) {
        if (request.method === 'GET') return sendJson(response, profileView())
        if (request.method === 'POST') {
          try {
            const input = await readJson(request) as HarmonyProfileUpdate
            const result = await operations.updateProfile(input)
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
            const result = await operations.updatePatch(await readJson(request))
            return sendJson(response, { patches: result.patches })
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
        const inspection = operations.inspect({
          package: url.searchParams.get('package') ?? undefined,
          file: url.searchParams.get('file') ?? undefined,
        })
        return sendJson(response, {
          inspections: inspection.targets,
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
  ctx.on('loader/config-update', synchronizeLoader)
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
  await controlReady
}

export const inject = ['appExit']
