import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { findPackageJSON } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { orderViolations, type HarmonyOrderViolation, type HarmonyProvider } from './order.js'

export interface InstalledPlugin extends HarmonyProvider {
  dir: string
  version: string
  description: string
  patches: string[]
  conflicts: string[]
  author: string
  contributors: string[]
  homepage: string
  bugs: string
  license: string
}

export interface HarmonyIncompatibility {
  declaredBy: string
  conflictsWith: string
}

export interface HarmonyProfile {
  dir: string
  order: string[]
  disabled: string[]
  plugins: InstalledPlugin[]
  incompatibilities: HarmonyIncompatibility[]
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
  conflicts: string[]
  author: string
  contributors: string[]
  homepage: string
  bugs: string
  license: string
}

export interface HarmonyProfileView {
  dir: string
  order: string[]
  disabled: string[]
  plugins: HarmonyProfilePluginView[]
  orderViolations: HarmonyOrderViolation[]
  incompatibilities: HarmonyIncompatibility[]
}

export interface HarmonyProfileUpdate {
  order?: string[]
  disabled?: string[]
}

export const HARMONY_STATE_FILE = 'harmony.json'
export const HARMONY_PLUGIN = 'dsh-harmony'

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

function installedPlugins(profileDir: string, requested?: string[]): InstalledPlugin[] {
  const profilePath = join(profileDir, 'package.json')
  const profile = JSON.parse(readFileSync(join(profileDir, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
  }
  const candidates = requested ?? [...new Set([...readState(profileDir).order, ...Object.keys(profile.dependencies ?? {})])]
  const plugins: InstalledPlugin[] = []
  for (const dependency of candidates) {
    let manifestPath: string | undefined
    try {
      manifestPath = dependency === 'dsh-harmony'
        ? fileURLToPath(new URL('../package.json', import.meta.url))
        : findPackageJSON(dependency, pathToFileURL(profilePath))
    } catch {
      continue
    }
    if (manifestPath === undefined) continue
    const dir = dirname(manifestPath)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      name: string
      version?: string
      description?: string
      author?: unknown
      contributors?: unknown[]
      homepage?: string
      bugs?: string | { url?: string }
      license?: string
      dsh?: { harmony?: { patches?: string[]; before?: string[]; after?: string[]; conflicts?: string[] } }
    }
    const harmony = manifest.dsh?.harmony
    plugins.push({
      name: manifest.name,
      dir,
      version: manifest.version ?? '',
      description: manifest.description ?? '',
      patches: harmony?.patches ?? [],
      before: harmony?.before ?? [],
      after: harmony?.after ?? [],
      conflicts: harmony?.conflicts ?? [],
      author: person(manifest.author),
      contributors: (manifest.contributors ?? []).map(person).filter(Boolean),
      homepage: manifest.homepage ?? '',
      bugs: typeof manifest.bugs === 'string' ? manifest.bugs : manifest.bugs?.url ?? '',
      license: manifest.license ?? '',
    })
  }
  return plugins
}

export function providerIncompatibilities(
  plugins: InstalledPlugin[],
  disabled: string[],
): HarmonyIncompatibility[] {
  const disabledKeys = new Set(disabled)
  const active = new Set(plugins
    .filter(plugin => plugin.patches.length > 0 && !disabledKeys.has(`${plugin.name}/*`))
    .map(plugin => plugin.name))
  return plugins.flatMap(plugin => !active.has(plugin.name) ? [] : plugin.conflicts
    .filter(name => name !== plugin.name && active.has(name))
    .map(conflictsWith => ({ declaredBy: plugin.name, conflictsWith })))
}

export interface HarmonyState {
  order: string[]
  disabled: string[]
}

function readState(profileDir: string): HarmonyState {
  const path = join(profileDir, HARMONY_STATE_FILE)
  if (!existsSync(path)) return { order: [], disabled: [] }
  const state = JSON.parse(readFileSync(path, 'utf8')) as { order: string[]; disabled?: string[] }
  return { order: state.order, disabled: state.disabled ?? [] }
}

export function saveHarmonyState(profileDir: string, state: HarmonyState): void {
  const path = join(profileDir, HARMONY_STATE_FILE)
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify({ order: pinHarmonyOrder(state.order), disabled: state.disabled }, null, 2)}\n`)
  renameSync(temporary, path)
}

export function saveHarmonyOrder(profileDir: string, order: string[]): void {
  saveHarmonyState(profileDir, { ...readState(profileDir), order })
}

export function synchronizeHarmonyProfile(profileDir: string, requested?: string[], persist = true): HarmonyProfile {
  const plugins = installedPlugins(profileDir, requested)
  const installed = new Set(plugins.map(plugin => plugin.name))
  const state = readState(profileDir)
  const current = state.order
  const collected = current.filter(name => installed.has(name))
  const present = new Set(collected)
  for (const plugin of plugins) {
    if (!present.has(plugin.name)) collected.push(plugin.name)
  }
  const order = pinHarmonyOrder(collected)
  if (persist && (order.length !== current.length || order.some((name, index) => name !== current[index]))) {
    saveHarmonyState(profileDir, { ...state, order })
  }
  return {
    dir: profileDir,
    order,
    disabled: state.disabled,
    plugins,
    incompatibilities: providerIncompatibilities(plugins, state.disabled),
  }
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.length === 0)) {
    throw new TypeError(`dsh-harmony: profile ${field} must be an array of non-empty strings`)
  }
  return [...value]
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

export function prepareHarmonyProfileUpdate(profile: HarmonyProfile, input: HarmonyProfileUpdate): HarmonyProfile {
  if (typeof input !== 'object' || input === null) throw new TypeError('dsh-harmony: profile update must be an object')
  const order = profileOrder(profile.order, input.order)
  const disabled = [...new Set(input.disabled === undefined ? profile.disabled : stringList(input.disabled, 'disabled'))]
  const ordered = new Set(order)
  return {
    ...profile,
    order,
    disabled,
    incompatibilities: providerIncompatibilities(profile.plugins.filter(plugin => ordered.has(plugin.name)), disabled),
  }
}

export function createHarmonyProfileView(
  profile: HarmonyProfile,
  patchCounts: ReadonlyMap<string, number> = new Map(),
): HarmonyProfileView {
  return {
    dir: profile.dir,
    order: [...profile.order],
    disabled: [...profile.disabled],
    orderViolations: orderViolations(profile.order, profile.plugins),
    incompatibilities: profile.incompatibilities.map(item => ({ ...item })),
    plugins: profile.plugins.map(({
      name, version, description, patches, before, after, conflicts, author, contributors, homepage, bugs, license,
    }) => ({
      name,
      version,
      description,
      harmony: patches.length > 0,
      patches: [...patches],
      ...(patchCounts.has(name) ? { patchCount: patchCounts.get(name)! } : {}),
      before: [...before],
      after: [...after],
      conflicts: [...conflicts],
      author,
      contributors: [...contributors],
      homepage,
      bugs,
      license,
    })),
  }
}

export function readHarmonyProfile(profileDir: string): HarmonyProfileView {
  return createHarmonyProfileView(synchronizeHarmonyProfile(profileDir, undefined, false))
}

/** Validate and normalize an update for a stopped profile without writing it. */
export function preflightHarmonyProfileUpdate(profileDir: string, input: HarmonyProfileUpdate): HarmonyProfileView {
  return createHarmonyProfileView(prepareHarmonyProfileUpdate(
    synchronizeHarmonyProfile(profileDir, undefined, false),
    input,
  ))
}

/** Atomically update a stopped profile. Running profiles must use HarmonyService.updateProfile(). */
export function updateHarmonyProfile(profileDir: string, input: HarmonyProfileUpdate): HarmonyProfileView {
  const candidate = prepareHarmonyProfileUpdate(synchronizeHarmonyProfile(profileDir, undefined, false), input)
  saveHarmonyState(profileDir, { order: candidate.order, disabled: candidate.disabled })
  return createHarmonyProfileView(candidate)
}
