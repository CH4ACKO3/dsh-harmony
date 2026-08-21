import { existsSync, readFileSync } from 'node:fs'
import { findPackageJSON } from 'node:module'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import {
  evaluatePluginCompatibility,
  parsePluginCompatibility,
  type HarmonyActivePlugin,
  type HarmonyPluginCompatibilityDeclarations,
  type HarmonyPluginCompatibilityFinding,
} from './compatibility.js'
import { orderViolations, type HarmonyOrderViolation, type HarmonyProvider } from './order.js'

export interface InstalledPlugin extends HarmonyProvider {
  dir: string
  version: string
  description: string
  patches: string[]
  compatibility: HarmonyPluginCompatibilityDeclarations
  author: string
  contributors: string[]
  homepage: string
  bugs: string
  license: string
}

export interface HarmonyProfile {
  dir: string
  workerThreads: number
  order: string[]
  patchOrder: string[]
  disabled: string[]
  plugins: InstalledPlugin[]
  compatibility: HarmonyPluginCompatibilityFinding[]
}

export interface HarmonyProfilePluginView {
  name: string
  version: string
  description: string
  harmony: boolean
  patches: string[]
  patchCount?: number
  before: string[]
  after: string[]
  compatibility: HarmonyPluginCompatibilityDeclarations
  author: string
  contributors: string[]
  homepage: string
  bugs: string
  license: string
}

export interface HarmonyProfileView {
  revision: number
  dir: string
  workerThreads: number
  order: string[]
  patchOrder: string[]
  disabled: string[]
  plugins: HarmonyProfilePluginView[]
  orderViolations: HarmonyOrderViolation[]
  patchOrderViolations: HarmonyOrderViolation[]
  compatibility: HarmonyPluginCompatibilityFinding[]
}

export interface HarmonyProfileUpdate {
  expectedRevision?: number
  workerThreads?: number
  order?: string[]
  patchOrder?: string[]
  disabled?: string[]
}

export const HARMONY_STATE_FILE = 'harmony.json'
export const HARMONY_PLUGIN = 'dsh-harmony'
const SETTINGS_PLUGIN = '@deepseek-ai/dsh-client-ui-settings-general'
const SETTINGS_PATCH = './lib/builtins/settings.patch.cjs'

export function pinHarmonyOrder(order: string[]): string[] {
  if (!order.includes(HARMONY_PLUGIN)) return order
  return [HARMONY_PLUGIN, ...order.filter(name => name !== HARMONY_PLUGIN)]
}

function person(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value !== 'object' || value === null) return ''
  const item = value as { name?: string; email?: string; url?: string }
  return item.name ?? item.email ?? item.url ?? ''
}

function installedPlugins(profileDir: string, requested?: string[], additional: string[] = []): InstalledPlugin[] {
  const profilePath = join(profileDir, 'package.json')
  const profile = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
    dsh?: { profile?: { bundles?: string[] } }
  }
  const candidates = [...new Set([
    ...(requested ?? [
      ...Object.keys(profile.dependencies ?? {}),
      ...(profile.dsh?.profile?.bundles ?? []),
    ]),
    ...additional,
  ])]
  const plugins: InstalledPlugin[] = []
  const seen = new Set<string>()
  let settingsDependencyAvailable = false
  for (const dependency of candidates) {
    let manifestPath: string | undefined
    try {
      if (isAbsolute(dependency)) manifestPath = dependency
      else if (dependency === 'dsh-harmony') manifestPath = fileURLToPath(new URL('../package.json', import.meta.url))
      else manifestPath = findPackageJSON(dependency, pathToFileURL(profilePath))
    } catch {
      continue
    }
    if (manifestPath === undefined) continue
    const dir = dirname(manifestPath)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      name: string
      version?: string
      dependencies?: Record<string, string>
      description?: string
      author?: unknown
      contributors?: unknown[]
      homepage?: string
      bugs?: string | { url?: string }
      license?: string
      dsh?: {
        plugin?: { compatibility?: unknown }
        harmony?: { patches?: string[]; before?: string[]; after?: string[] }
      }
    }
    const harmony = manifest.dsh?.harmony
    if (manifest.dependencies?.[SETTINGS_PLUGIN] !== undefined) {
      try {
        settingsDependencyAvailable ||= findPackageJSON(SETTINGS_PLUGIN, pathToFileURL(manifestPath)) !== undefined
      } catch {}
    }
    if (seen.has(manifest.name)) continue
    seen.add(manifest.name)
    plugins.push({
      name: manifest.name,
      dir,
      version: manifest.version ?? '0.0.0',
      description: manifest.description ?? '',
      patches: harmony?.patches ?? [],
      before: harmony?.before ?? [],
      after: harmony?.after ?? [],
      compatibility: parsePluginCompatibility(manifest.dsh?.plugin?.compatibility, manifest.name),
      author: person(manifest.author),
      contributors: (manifest.contributors ?? []).map(person).filter(Boolean),
      homepage: manifest.homepage ?? '',
      bugs: typeof manifest.bugs === 'string' ? manifest.bugs : manifest.bugs?.url ?? '',
      license: manifest.license ?? '',
    })
  }
  const settingsAvailable = seen.has(SETTINGS_PLUGIN) || settingsDependencyAvailable
  if (settingsAvailable) return plugins
  return plugins.map(plugin => plugin.name === HARMONY_PLUGIN
    ? { ...plugin, patches: plugin.patches.filter(patch => patch !== SETTINGS_PATCH) }
    : plugin)
}

export interface HarmonyState {
  workerThreads: number
  order: string[]
  patchOrder: string[]
  disabled: string[]
}

export class HarmonyProfileConflictError extends Error {
  readonly code = 'HARMONY_PROFILE_CONFLICT'

  constructor(readonly expected: number, readonly actual: number) {
    super(`dsh-harmony: profile changed since it was read (expected revision ${expected}, now ${actual})`)
    this.name = 'HarmonyProfileConflictError'
  }
}

function readState(profileDir: string): HarmonyState {
  const path = join(profileDir, HARMONY_STATE_FILE)
  if (!existsSync(path)) return { workerThreads: 1, order: [], patchOrder: [], disabled: [] }
  const state = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  return {
    workerThreads: workerThreadCount(state.workerThreads ?? 1),
    order: stringList(state.order, 'order'),
    patchOrder: stringList(state.patchOrder ?? [], 'patchOrder'),
    disabled: stringList(state.disabled, 'disabled'),
  }
}

export async function saveHarmonyState(profileDir: string, state: HarmonyState): Promise<void> {
  const path = join(profileDir, HARMONY_STATE_FILE)
  await withFileLock(path, async () => {
    readState(profileDir)
    await writeFileAtomic(path, `${JSON.stringify({
      order: pinHarmonyOrder(state.order),
      workerThreads: state.workerThreads,
      patchOrder: state.patchOrder,
      disabled: state.disabled,
    }, null, 2)}\n`, { mode: 0o600 })
  })
}

export function synchronizeHarmonyProfile(
  profileDir: string,
  requested?: string[],
  activePlugins?: HarmonyActivePlugin[],
  additional: string[] = [],
): HarmonyProfile {
  const plugins = installedPlugins(profileDir, requested, additional)
  const installed = new Set(plugins.map(plugin => plugin.name))
  const state = readState(profileDir)
  const current = state.order
  const collected = current.filter(name => installed.has(name))
  const present = new Set(collected)
  for (const plugin of plugins) {
    if (!present.has(plugin.name)) collected.push(plugin.name)
  }
  const order = pinHarmonyOrder(collected)
  return {
    dir: profileDir,
    workerThreads: state.workerThreads,
    order,
    patchOrder: state.patchOrder,
    disabled: state.disabled,
    plugins,
    compatibility: evaluatePluginCompatibility(
      plugins,
      activePlugins ?? plugins.map(plugin => ({ name: plugin.name, entryIds: [] })),
    ),
  }
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.length === 0)) {
    throw new TypeError(`dsh-harmony: profile ${field} must be an array of non-empty strings`)
  }
  return [...value]
}

export const MAX_HARMONY_WORKER_THREADS = 32

function workerThreadCount(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > MAX_HARMONY_WORKER_THREADS) {
    throw new TypeError(`dsh-harmony: profile workerThreads must be an integer from 1 to ${MAX_HARMONY_WORKER_THREADS}`)
  }
  return value as number
}

function profileOrder(current: string[], input: unknown): string[] {
  const order = pinHarmonyOrder(input === undefined ? [...current] : stringList(input, 'order'))
  const expected = new Set(current)
  const seen = new Set<string>()
  for (const name of order) {
    if (!expected.has(name)) throw new Error(`dsh-harmony: profile order contains unknown package ${JSON.stringify(name)}`)
    if (seen.has(name)) throw new Error(`dsh-harmony: profile order contains duplicate package ${JSON.stringify(name)}`)
    seen.add(name)
  }
  const missing = current.filter(name => !seen.has(name))
  if (missing.length > 0) {
    throw new Error(`dsh-harmony: profile order omits installed package${missing.length === 1 ? '' : 's'} ${missing.map(name => JSON.stringify(name)).join(', ')}`)
  }
  return order
}

function patchOrder(current: string[], input: unknown): string[] {
  const order = input === undefined ? [...current] : stringList(input, 'patchOrder')
  const seen = new Set<string>()
  for (const key of order) {
    if (seen.has(key)) throw new Error(`dsh-harmony: profile patchOrder contains duplicate Patch ${JSON.stringify(key)}`)
    seen.add(key)
  }
  if (input === undefined || current.length === 0) return order
  const expected = new Set(current)
  for (const key of order) {
    if (!expected.has(key)) throw new Error(`dsh-harmony: profile patchOrder contains unknown Patch ${JSON.stringify(key)}`)
  }
  const missing = current.filter(key => !seen.has(key))
  if (missing.length > 0) {
    throw new Error(`dsh-harmony: profile patchOrder omits registered Patch${missing.length === 1 ? '' : 'es'} ${missing.map(key => JSON.stringify(key)).join(', ')}`)
  }
  return order
}

export function groupHarmonyPatchOrder(order: string[], current: string[]): string[] {
  const owners = new Set(order)
  const grouped = new Map<string, string[]>()
  for (const key of current) {
    let separator = key.lastIndexOf('/')
    while (separator >= 0) {
      const owner = key.slice(0, separator)
      if (owners.has(owner)) {
        const patches = grouped.get(owner) ?? []
        patches.push(key)
        grouped.set(owner, patches)
        break
      }
      separator = key.lastIndexOf('/', separator - 1)
    }
  }
  return order.flatMap(owner => grouped.get(owner) ?? [])
}

export function prepareHarmonyProfileUpdate(profile: HarmonyProfile, input: HarmonyProfileUpdate): HarmonyProfile {
  if (typeof input !== 'object' || input === null) throw new TypeError('dsh-harmony: profile update must be an object')
  if (input.expectedRevision !== undefined
    && (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0)) {
    throw new TypeError('dsh-harmony: profile expectedRevision must be a non-negative integer')
  }
  const order = profileOrder(profile.order, input.order)
  const nextPatchOrder = input.patchOrder === undefined && input.order !== undefined
    ? groupHarmonyPatchOrder(order, profile.patchOrder)
    : patchOrder(profile.patchOrder, input.patchOrder)
  const disabled = [...new Set(input.disabled === undefined ? profile.disabled : stringList(input.disabled, 'disabled'))]
  return {
    ...profile,
    workerThreads: input.workerThreads === undefined ? profile.workerThreads : workerThreadCount(input.workerThreads),
    order,
    patchOrder: nextPatchOrder,
    disabled,
  }
}

export function createHarmonyProfileView(
  profile: HarmonyProfile,
  patchCounts: ReadonlyMap<string, number> = new Map(),
  patchOrderViolations: HarmonyOrderViolation[] = [],
  revision = 0,
): HarmonyProfileView {
  return {
    revision,
    dir: profile.dir,
    workerThreads: profile.workerThreads,
    order: [...profile.order],
    patchOrder: [...profile.patchOrder],
    disabled: [...profile.disabled],
    orderViolations: orderViolations(profile.order, profile.plugins),
    patchOrderViolations: patchOrderViolations.map(item => ({ ...item })),
    compatibility: profile.compatibility.map(item => item.kind === 'conflict'
      ? {
          ...item,
          left: { ...item.left, entryIds: [...item.left.entryIds] },
          right: { ...item.right, entryIds: [...item.right.entryIds] },
          declaredBy: [...item.declaredBy],
        }
      : item.kind === 'requirement'
        ? {
            ...item,
            owner: { ...item.owner, entryIds: [...item.owner.entryIds] },
            target: { ...item.target, entryIds: [...item.target.entryIds] },
          }
        : {
            ...item,
            owner: { ...item.owner, entryIds: [...item.owner.entryIds] },
            target: { ...item.target, entryIds: [...item.target.entryIds] },
          }),
    plugins: profile.plugins.map(({
      name, version, description, patches, before, after, compatibility, author, contributors, homepage, bugs, license,
    }) => ({
      name,
      version,
      description,
      harmony: patches.length > 0,
      patches: [...patches],
      ...(patchCounts.has(name) ? { patchCount: patchCounts.get(name)! } : {}),
      before: [...before],
      after: [...after],
      compatibility: {
        requires: { ...compatibility.requires },
        conflicts: { ...compatibility.conflicts },
        integrates: { ...compatibility.integrates },
      },
      author,
      contributors: [...contributors],
      homepage,
      bugs,
      license,
    })),
  }
}

export function readHarmonyProfile(profileDir: string, configured: string[] = []): HarmonyProfileView {
  return createHarmonyProfileView(synchronizeHarmonyProfile(profileDir, undefined, undefined, configured))
}

/** Validate and normalize an update for a stopped profile without writing it. */
export function preflightHarmonyProfileUpdate(
  profileDir: string,
  input: HarmonyProfileUpdate,
  configured: string[] = [],
): HarmonyProfileView {
  return createHarmonyProfileView(prepareHarmonyProfileUpdate(
    synchronizeHarmonyProfile(profileDir, undefined, undefined, configured),
    input,
  ))
}

/** Atomically update a stopped profile. Running profiles must use HarmonyService.updateProfile(). */
export async function updateStoppedHarmonyProfile(
  profileDir: string,
  input: HarmonyProfileUpdate,
  configured: string[] = [],
): Promise<HarmonyProfileView> {
  const candidate = prepareHarmonyProfileUpdate(
    synchronizeHarmonyProfile(profileDir, undefined, undefined, configured),
    input,
  )
  await saveHarmonyState(profileDir, {
    workerThreads: candidate.workerThreads,
    order: candidate.order,
    patchOrder: candidate.patchOrder,
    disabled: candidate.disabled,
  })
  return createHarmonyProfileView(candidate)
}
