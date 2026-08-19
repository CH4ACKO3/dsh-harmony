import { createHash } from 'node:crypto'
import fs, { existsSync, realpathSync, watchFile, unwatchFile } from 'node:fs'
import { createRequire, findPackageJSON, registerHooks, syncBuiltinESMExports } from 'node:module'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'
import MagicString from 'magic-string'
import semver from 'semver'
import ts from 'typescript'
import { tsquery } from '@phenomnomnominal/tsquery'
import type {
  HarmonyCompositePatch,
  HarmonyPatch,
  HarmonyPatchDeclaration,
  HarmonyPatchInspection,
  HarmonyPatchDependency,
  HarmonyLoaderPatch,
  HarmonyPatchStatus,
  HarmonySemanticContext,
  HarmonySemanticPatch,
  HarmonySourcePatch,
} from './index.js'
import { autoSortPatchOrder, patchOrderViolations, type HarmonyPatchOrderItem } from './order.js'
import { schedulePatchBatches } from './scheduler.js'
import {
  HARMONY_STATE_FILE,
  groupHarmonyPatchOrder,
  pinHarmonyOrder,
  saveHarmonyState,
  synchronizeHarmonyProfile,
} from './profile.js'
import type { HarmonyProfile } from './profile.js'
import type { HarmonyActivePlugin } from './conflicts.js'

const nativeReadFileSync = fs.readFileSync.bind(fs)
const nativeReadFile = fs.promises.readFile.bind(fs.promises)

interface PackageInfo {
  dir: string
  name: string
  version: string
  type?: string
  harmony?: { patches?: string[]; before?: string[]; after?: string[] }
}

interface RegisteredPatch {
  declarationPatch: HarmonyPatchDeclaration
  members: HarmonyPatch[]
  owner: string
  key: string
  index: number
  declaration: string
}

interface ProviderRecord {
  info: PackageInfo
  patches: RegisteredPatch[]
  files: string[]
  signature: string
}

interface TransformRecord {
  filename: string
  generation: number
  packageVersion: string
  source: string
  output: string
  inspection: HarmonyPatchInspection
}

interface GenerationState {
  providers: ProviderRecord[]
  order: string[]
  patchOrder: string[]
  disabled: Set<string>
}

export interface ProfileTransaction {
  generation: number
  profile: HarmonyProfile
  targets: PatchTargets
  commit(): void
  rollback(): void
}

export type PatchTargets = Map<string, Set<string>>

const providers = new Map<string, ProviderRecord>()
const loadedPatchFiles = new Set<string>()
const loadingPatchFiles = new Set<string>()
let declaredProviderFiles = new Set<string>()
const packageCache = new Map<string, PackageInfo | undefined>()
const runtimeRequire = createRequire(import.meta.url)
const stagedProviderCaches = new Map<string, () => void>()
const listeners = new Set<(targets: PatchTargets, generation: number) => void>()
const patchStatusListeners = new Set<() => void>()
const pendingStatusGenerations = new Set<number>()
const moduleSourcesLoading = new Map<string, number>()
const transformationsInProgress = new Set<string>()
let transformCache = new Map<string, TransformRecord>()
let patchStatuses = new Map<string, HarmonyPatchStatus>()
interface BoundSemanticPatch {
  registered: RegisteredPatch
  patch: HarmonySemanticPatch
}
let semanticBindings = new Map<string, BoundSemanticPatch[]>()
let generation = 0
let generationSequence = 0
const generationStates = new Map<number, GenerationState>([[0, {
  providers: [], order: [], patchOrder: [], disabled: new Set(),
}]])
let activeProfileDir: string | undefined
let providerOrder: string[] = []
let patchOrder: string[] = []
let disabledPatchKeys = new Set<string>()
let activePlugins: HarmonyActivePlugin[] = []
let refreshWatchedFiles: (() => void) | undefined
let moduleHooksInstalled = false

const pluginUrl = new URL('./plugin.js', import.meta.url).href
const indexUrl = new URL('./index.js', import.meta.url).href
const manifestUrl = new URL('../package.json', import.meta.url).href

function readPackageInfo(packageDir: string): PackageInfo {
  const manifest = JSON.parse(nativeReadFileSync(join(packageDir, 'package.json'), 'utf8')) as {
    name: string
    version?: string
    type?: string
    dsh?: { harmony?: { patches?: string[]; before?: string[]; after?: string[] } }
  }
  return {
    dir: realpathSync(packageDir),
    name: manifest.name,
    version: manifest.version ?? '0.0.0',
    type: manifest.type,
    harmony: manifest.dsh?.harmony,
  }
}

function packageFor(filename: string): PackageInfo | undefined {
  let dir = dirname(filename)
  const visited: string[] = []
  while (true) {
    if (packageCache.has(dir)) {
      const cached = packageCache.get(dir)
      for (const item of visited) packageCache.set(item, cached)
      return cached
    }
    visited.push(dir)
    if (existsSync(join(dir, 'package.json'))) {
      const info = readPackageInfo(dir)
      for (const item of visited) packageCache.set(item, info)
      return info
    }
    const parent = dirname(dir)
    if (parent === dir) {
      for (const item of visited) packageCache.set(item, undefined)
      return undefined
    }
    dir = parent
  }
}

function addTarget(targets: PatchTargets, packageName: string, file: string): void {
  const files = targets.get(packageName) ?? new Set<string>()
  files.add(file)
  targets.set(packageName, files)
}

function addPatchTargets(targets: PatchTargets, patches: RegisteredPatch[]): void {
  for (const registered of patches) {
    for (const patch of registered.members) {
      for (const file of patch.target.files) addTarget(targets, patch.target.package, file)
    }
  }
}

function mergeTargets(targets: PatchTargets, additions: PatchTargets): void {
  for (const [packageName, files] of additions) {
    for (const file of files) addTarget(targets, packageName, file)
  }
}

function allTargets(): PatchTargets {
  const targets: PatchTargets = new Map()
  for (const provider of providers.values()) addPatchTargets(targets, provider.patches)
  return targets
}

function targetsOf(records: Iterable<ProviderRecord>): PatchTargets {
  const targets: PatchTargets = new Map()
  for (const provider of records) addPatchTargets(targets, provider.patches)
  return targets
}

function patchKind(patch: HarmonyPatch): 'source' | 'semantic' | 'loader' {
  if ('loader' in patch) return 'loader'
  return 'select' in patch ? 'source' : 'semantic'
}

function isCompositePatch(patch: HarmonyPatchDeclaration): patch is HarmonyCompositePatch {
  return 'patches' in patch
}

function orderItem(registered: RegisteredPatch): HarmonyPatchOrderItem {
  return {
    key: registered.key,
    owner: registered.owner,
    index: registered.index,
    before: registered.declarationPatch.before,
    after: registered.declarationPatch.after,
  }
}

function defaultPatchOrder(order: string[], records: Iterable<ProviderRecord>): string[] {
  const rank = new Map(order.map((owner, index) => [owner, index]))
  return [...records].flatMap(provider => provider.patches)
    .sort((a, b) => (rank.get(a.owner) ?? Number.MAX_SAFE_INTEGER)
      - (rank.get(b.owner) ?? Number.MAX_SAFE_INTEGER) || a.index - b.index)
    .map(registered => registered.key)
}

function reconcilePatchOrder(
  requested: string[],
  order: string[],
  records: Iterable<ProviderRecord>,
): string[] {
  const providers = [...records]
  const defaults = defaultPatchOrder(order, providers)
  const items = providers.flatMap(provider => provider.patches).map(orderItem)
  const constraints = providers.map(record => record.info.harmony === undefined
    ? { name: record.info.name, before: [], after: [] }
    : {
        name: record.info.name,
        before: record.info.harmony.before ?? [],
        after: record.info.harmony.after ?? [],
      })
  if (requested.length === 0) return autoSortPatchOrder(defaults, items, constraints)
  const known = new Set(defaults)
  const reconciled = requested.filter((key, index) => known.has(key) && requested.indexOf(key) === index)
  const present = new Set(reconciled)
  const defaultRank = new Map(defaults.map((key, index) => [key, index]))
  const inversions = (candidate: string[]): number => {
    let count = 0
    for (let left = 0; left < candidate.length; left += 1) {
      for (let right = left + 1; right < candidate.length; right += 1) {
        if (defaultRank.get(candidate[left]!)! > defaultRank.get(candidate[right]!)!) count += 1
      }
    }
    return count
  }
  for (const key of defaults) {
    if (present.has(key)) continue
    let best: string[] | undefined
    let bestViolations = Number.POSITIVE_INFINITY
    let bestInversions = Number.POSITIVE_INFINITY
    for (let index = 0; index <= reconciled.length; index += 1) {
      const candidate = [...reconciled.slice(0, index), key, ...reconciled.slice(index)]
      const violations = patchOrderViolations(candidate, items, constraints).length
      const changed = inversions(candidate)
      if (violations < bestViolations || violations === bestViolations && changed < bestInversions) {
        best = candidate
        bestViolations = violations
        bestInversions = changed
      }
    }
    reconciled.splice(0, reconciled.length, ...best!)
    present.add(key)
  }
  return reconciled
}

function isPatchDisabled(registered: RegisteredPatch, disabled = disabledPatchKeys): boolean {
  return disabled.has(registered.key) || disabled.has(`${registered.owner}/*`)
}

function freshStatus(registered: RegisteredPatch): HarmonyPatchStatus {
  const simple = registered.members.length === 1 ? registered.members[0]! : undefined
  const semantic = simple !== undefined && patchKind(simple) === 'semantic' ? simple as HarmonySemanticPatch : undefined
  const loader = simple !== undefined && patchKind(simple) === 'loader' ? simple as HarmonyLoaderPatch : undefined
  return {
    key: registered.key,
    id: registered.declarationPatch.id,
    owner: registered.owner,
    index: registered.index,
    ...(registered.declarationPatch.before === undefined
      ? {} : { before: [...registered.declarationPatch.before] }),
    ...(registered.declarationPatch.after === undefined
      ? {} : { after: [...registered.declarationPatch.after] }),
    targets: registered.members.map(patch => patch.target),
    kind: simple === undefined ? 'composite' : patchKind(simple),
    operation: semantic?.operation,
    loader: loader?.loader,
    ...(simple === undefined ? {
      members: registered.members.map(patch => ({
        id: patch.id,
        target: patch.target,
        kind: patchKind(patch),
        ...(patchKind(patch) === 'semantic' ? { operation: (patch as HarmonySemanticPatch).operation } : {}),
        ...(patchKind(patch) === 'loader' ? { loader: (patch as HarmonyLoaderPatch).loader } : {}),
      })),
    } : {}),
    state: isPatchDisabled(registered) ? 'disabled' : 'pending',
    status: isPatchDisabled(registered) ? 'disabled' : 'normal',
    loaded: false,
    matches: 0,
    generation,
    declaration: registered.declaration,
  }
}

function resetPatchStatuses(): void {
  patchStatuses = new Map([...providers.values()].flatMap(provider => provider.patches).map(registered => [
    registered.key,
    freshStatus(registered),
  ]))
}

function snapshotGeneration(retainedGeneration?: number): void {
  const retainedState = retainedGeneration === undefined ? undefined : generationStates.get(retainedGeneration)
  generationStates.clear()
  if (retainedState !== undefined) generationStates.set(retainedGeneration!, retainedState)
  generationStates.set(generation, {
    providers: [...providers.values()],
    order: [...providerOrder],
    patchOrder: [...patchOrder],
    disabled: new Set(disabledPatchKeys),
  })
}

export function retainedGenerationCount(): number {
  return generationStates.size
}

function retainGeneration(activeGeneration: number): void {
  const state = generationStates.get(activeGeneration)!
  generationStates.clear()
  generationStates.set(activeGeneration, state)
}

function pruneSemanticBindings(activeGeneration: number): void {
  const prefix = `${activeGeneration}\0`
  semanticBindings = new Map([...semanticBindings].filter(([key]) => key.startsWith(prefix)))
}

function updateStatus(registered: RegisteredPatch, value: Partial<HarmonyPatchStatus>): void {
  const previous = patchStatuses.get(registered.key) ?? freshStatus(registered)
  const next = { ...previous, ...value }
  next.status = next.state === 'disabled'
    ? 'disabled'
    : next.state === 'failed'
      ? 'error'
      : value.status ?? (value.state === undefined ? previous.status : 'normal')
  patchStatuses.set(registered.key, next)
  if (!pendingStatusGenerations.has(next.generation)
    && (previous.state !== next.state || previous.status !== next.status || previous.error !== next.error)) {
    for (const listener of patchStatusListeners) listener()
  }
}

function notify(targets: PatchTargets): void {
  if (targets.size === 0) return
  generation = ++generationSequence
  resetPatchStatuses()
  snapshotGeneration()
  for (const listener of listeners) listener(targets, generation)
}

function providerSignature(info: PackageInfo, files: string[]): string {
  const hash = createHash('sha256')
    .update(info.version)
    .update(JSON.stringify(info.harmony))
  for (const filename of files) hash.update(nativeReadFileSync(filename)).update('\0')
  return hash.digest('hex')
}

function insideDirectory(directory: string, filename: string): boolean {
  const path = relative(directory, filename)
  return path === '' || !path.startsWith('..') && !isAbsolute(path)
}

function beginCommonJSCacheUpdate(matches: (filename: string) => boolean): () => void {
  const previous = new Map(Object.entries(runtimeRequire.cache).filter(([filename]) => matches(filename)))
  for (const filename of Object.keys(runtimeRequire.cache)) if (matches(filename)) delete runtimeRequire.cache[filename]
  return () => {
    for (const filename of Object.keys(runtimeRequire.cache)) if (matches(filename)) delete runtimeRequire.cache[filename]
    for (const [filename, module] of previous) runtimeRequire.cache[filename] = module
  }
}

function providerFiles(declaredFiles: string[], directory: string): string[] {
  const files = new Set<string>()
  const visitFile = (filename: string): void => {
    if (files.has(filename)) return
    files.add(filename)
    if (!isJavaScript(filename)) return
    const sourceFile = parse(filename, nativeReadFileSync(filename, 'utf8'))
    const visitNode = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require'
        && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text.startsWith('.')) {
        const dependency = createRequire(filename).resolve(node.arguments[0].text)
        if (insideDirectory(directory, dependency)) visitFile(dependency)
      }
      ts.forEachChild(node, visitNode)
    }
    visitNode(sourceFile)
  }
  for (const filename of declaredFiles) visitFile(filename)
  return [...files]
}

function prepareProvider(info: PackageInfo, current?: ProviderRecord, stage = false): ProviderRecord | undefined {
  if (info.harmony?.patches === undefined) return undefined
  const declaredFiles = info.harmony.patches.map(declared => realpathSync(join(info.dir, declared)))
  const files = providerFiles(declaredFiles, info.dir)
  const signature = providerSignature(info, files)
  if (current?.signature === signature) return current
  const registered: RegisteredPatch[] = []
  const ids = new Set<string>()
  let index = 0
  const fileSet = new Set(files)
  const restoreCache = beginCommonJSCacheUpdate(filename => stage ? insideDirectory(info.dir, filename) : fileSet.has(filename))
  if (stage) stagedProviderCaches.set(info.dir, restoreCache)
  for (const filename of declaredFiles) loadingPatchFiles.add(filename)
  try {
    for (const filename of declaredFiles) {
      const require = createRequire(join(info.dir, 'package.json'))
      const exported = require(filename) as HarmonyPatchDeclaration | HarmonyPatchDeclaration[]
        | { default?: HarmonyPatchDeclaration | HarmonyPatchDeclaration[] }
      const value = (exported as { default?: HarmonyPatchDeclaration | HarmonyPatchDeclaration[] }).default
        ?? exported as HarmonyPatchDeclaration | HarmonyPatchDeclaration[]
      for (const patch of Array.isArray(value) ? value : [value]) {
        if (ids.has(patch.id)) throw new Error(`dsh-harmony: duplicate patch id ${JSON.stringify(patch.id)} in ${JSON.stringify(info.name)}`)
        ids.add(patch.id)
        const members = isCompositePatch(patch) ? patch.patches : [patch]
        if (members.length === 0) {
          throw new Error(`dsh-harmony: composite Patch ${JSON.stringify(`${info.name}/${patch.id}`)} must contain at least one member`)
        }
        const memberIds = new Set<string>()
        for (const member of members) {
          if (memberIds.has(member.id)) {
            throw new Error(`dsh-harmony: duplicate member id ${JSON.stringify(member.id)} in composite Patch ${JSON.stringify(`${info.name}/${patch.id}`)}`)
          }
          memberIds.add(member.id)
          if (isCompositePatch(patch) && (member.before !== undefined || member.after !== undefined)) {
            throw new Error(`dsh-harmony: member ${JSON.stringify(member.id)} in composite Patch ${JSON.stringify(`${info.name}/${patch.id}`)} cannot declare before or after`)
          }
        }
        registered.push({
          declarationPatch: patch,
          members,
          owner: info.name,
          key: `${info.name}/${patch.id}`,
          index: index++,
          declaration: relative(info.dir, filename).replaceAll('\\', '/'),
        })
      }
    }
  } catch (error) {
    restoreCache()
    stagedProviderCaches.delete(info.dir)
    throw error
  } finally {
    for (const filename of declaredFiles) loadingPatchFiles.delete(filename)
  }
  return { info, patches: registered, files, signature }
}

export function discoverPackage(packageDir: string): void {
  const info = readPackageInfo(packageDir)
  const current = providers.get(info.name)
  const next = prepareProvider(info, current)
  if (next === undefined || next === current) return
  const targets: PatchTargets = new Map()
  if (current !== undefined) addPatchTargets(targets, current.patches)
  addPatchTargets(targets, next.patches)
  for (const filename of current?.files ?? []) loadedPatchFiles.delete(filename)
  for (const filename of next.files) loadedPatchFiles.add(filename)
  packageCache.set(info.dir, info)
  providers.set(info.name, next)
  if (!providerOrder.includes(info.name)) {
    providerOrder.push(info.name)
  }
  patchOrder = reconcilePatchOrder(patchOrder, providerOrder, providers.values())
  if (activeProfileDir !== undefined) saveHarmonyState(activeProfileDir, {
    order: providerOrder,
    patchOrder,
    disabled: [...disabledPatchKeys],
  })
  notify(targets)
}

export function synchronizeProfile(
  profileDir: string,
  installed?: string[],
  enabledPlugins?: HarmonyActivePlugin[],
): HarmonyProfile {
  const previousTargets = allTargets()
  const previousOrder = providerOrder
  const previousPatchOrder = patchOrder
  const previousDisabled = disabledPatchKeys
  const profile = synchronizeHarmonyProfile(profileDir, installed, false, enabledPlugins)
  const harmonyProviders = profile.plugins.filter(plugin => plugin.patches.length > 0)
  declaredProviderFiles = new Set([
    ...profile.plugins.map(plugin => join(plugin.dir, 'package.json')),
    ...harmonyProviders.flatMap(provider => provider.patches.map(file => join(provider.dir, file))),
  ])
  try {
    const nextProviders = new Map<string, ProviderRecord>()
    for (const provider of harmonyProviders) {
      const info = readPackageInfo(provider.dir)
      const record = prepareProvider(info, providers.get(provider.name))
      if (record !== undefined) nextProviders.set(provider.name, record)
    }
    const registryChanged = providers.size !== nextProviders.size
      || [...nextProviders].some(([name, record]) => providers.get(name) !== record)
    const orderChanged = previousOrder.length !== profile.order.length
      || previousOrder.some((owner, index) => owner !== profile.order[index])
    const disabledChanged = previousDisabled.size !== profile.disabled.length
      || profile.disabled.some(key => !previousDisabled.has(key))
    const currentTargets = targetsOf(nextProviders.values())
    const changedTargets: PatchTargets = new Map()
    mergeTargets(changedTargets, previousTargets)
    mergeTargets(changedTargets, currentTargets)

    synchronizeHarmonyProfile(profileDir, installed, true, enabledPlugins)
    providers.clear()
    for (const [name, record] of nextProviders) providers.set(name, record)
    loadedPatchFiles.clear()
    for (const record of nextProviders.values()) {
      packageCache.set(record.info.dir, record.info)
      for (const filename of record.files) loadedPatchFiles.add(filename)
    }
    activeProfileDir = profileDir
    activePlugins = enabledPlugins ?? profile.plugins.map(plugin => ({ name: plugin.name, entryIds: [] }))
    providerOrder = profile.order
    patchOrder = reconcilePatchOrder(profile.patchOrder, providerOrder, nextProviders.values())
    disabledPatchKeys = new Set(profile.disabled)
    const patchOrderChanged = previousPatchOrder.length !== patchOrder.length
      || previousPatchOrder.some((key, index) => key !== patchOrder[index])
    if (profile.patchOrder.length !== patchOrder.length
      || profile.patchOrder.some((key, index) => key !== patchOrder[index])) {
      saveHarmonyState(profileDir, { order: providerOrder, patchOrder, disabled: profile.disabled })
    }
    if (registryChanged || orderChanged || patchOrderChanged || disabledChanged) notify(changedTargets)
    return { ...profile, patchOrder: [...patchOrder] }
  } finally {
    refreshWatchedFiles?.()
  }
}

export function currentProfile(): HarmonyProfile {
  const profile = synchronizeHarmonyProfile(activeProfileDir!, undefined, false, activePlugins)
  const disabled = [...disabledPatchKeys]
  return {
    ...profile,
    order: [...providerOrder],
    patchOrder: [...patchOrder],
    disabled,
    pluginConflicts: profile.pluginConflicts,
  }
}

export function synchronizePluginOrder(installed: string[]): HarmonyProfile {
  return synchronizeProfile(activeProfileDir!, installed, activePlugins)
}

function replaceProviders(next: Map<string, ProviderRecord>): void {
  providers.clear()
  loadedPatchFiles.clear()
  for (const [name, record] of next) {
    providers.set(name, record)
    packageCache.set(record.info.dir, record.info)
    for (const filename of record.files) loadedPatchFiles.add(filename)
  }
}

export function beginPluginUpdate(
  installed: string[],
  force = false,
  enabledPlugins: HarmonyActivePlugin[] = installed.map(name => ({ name, entryIds: [] })),
): ProfileTransaction {
  activePlugins = enabledPlugins
  const profile = synchronizeHarmonyProfile(activeProfileDir!, installed, false, activePlugins)
  const harmonyProviders = profile.plugins.filter(plugin => plugin.patches.length > 0)
  const nextDeclared = new Set([
    ...profile.plugins.map(plugin => join(plugin.dir, 'package.json')),
    ...harmonyProviders.flatMap(provider => provider.patches.map(file => join(provider.dir, file))),
  ])
  const nextProviders = new Map<string, ProviderRecord>()
  try {
    for (const provider of harmonyProviders) {
      const info = readPackageInfo(provider.dir)
      const record = prepareProvider(info, providers.get(provider.name), true)
      if (record !== undefined) nextProviders.set(provider.name, record)
    }
  } catch (error) {
    for (const restore of [...stagedProviderCaches.values()].reverse()) restore()
    stagedProviderCaches.clear()
    declaredProviderFiles = nextDeclared
    refreshWatchedFiles?.()
    throw error
  }
  const nextPatchOrder = reconcilePatchOrder(profile.patchOrder, profile.order, nextProviders.values())
  const nextProfile = { ...profile, patchOrder: nextPatchOrder }
  const previous = {
    providers: new Map(providers),
    declared: declaredProviderFiles,
    order: providerOrder,
    patchOrder,
    disabled: disabledPatchKeys,
    generation,
    cache: transformCache,
    statuses: patchStatuses,
    bindings: semanticBindings,
  }
  const changed = previous.providers.size !== nextProviders.size
    || [...nextProviders].some(([name, record]) => previous.providers.get(name) !== record)
    || previous.order.length !== profile.order.length
    || previous.order.some((name, index) => name !== profile.order[index])
    || previous.patchOrder.length !== nextPatchOrder.length
    || previous.patchOrder.some((key, index) => key !== nextPatchOrder[index])
    || previous.disabled.size !== profile.disabled.length
    || profile.disabled.some(key => !previous.disabled.has(key))
  if (!changed && !force) {
    return {
      generation,
      profile: nextProfile,
      targets: new Map(),
      commit() {},
      rollback() {},
    }
  }
  const targets: PatchTargets = new Map()
  mergeTargets(targets, targetsOf(previous.providers.values()))
  mergeTargets(targets, targetsOf(nextProviders.values()))
  for (const name of new Set([...previous.providers.keys(), ...nextProviders.keys()])) {
    if (previous.providers.get(name) !== nextProviders.get(name)) addTarget(targets, name, 'package.json')
  }
  try {
    replaceProviders(nextProviders)
    declaredProviderFiles = nextDeclared
    providerOrder = profile.order
    patchOrder = nextPatchOrder
    disabledPatchKeys = new Set(profile.disabled)
    preflight(patchOrder, disabledPatchKeys)
  } catch (error) {
    for (const restore of [...stagedProviderCaches.values()].reverse()) restore()
    stagedProviderCaches.clear()
    replaceProviders(previous.providers)
    declaredProviderFiles = previous.declared
    providerOrder = previous.order
    patchOrder = previous.patchOrder
    disabledPatchKeys = previous.disabled
    throw error
  }
  generation = ++generationSequence
  const candidateGeneration = generation
  pendingStatusGenerations.add(candidateGeneration)
  transformCache = new Map()
  semanticBindings = new Map(previous.bindings)
  resetPatchStatuses()
  snapshotGeneration(previous.generation)
  let active = true
  return {
    generation: candidateGeneration,
    profile: nextProfile,
    targets,
    commit() {
      if (!active) return
      pruneSemanticBindings(candidateGeneration)
      saveHarmonyState(activeProfileDir!, {
        order: profile.order,
        patchOrder,
        disabled: profile.disabled,
      })
      refreshWatchedFiles?.()
      stagedProviderCaches.clear()
      retainGeneration(candidateGeneration)
      pendingStatusGenerations.delete(candidateGeneration)
      active = false
    },
    rollback() {
      if (!active) return
      replaceProviders(previous.providers)
      declaredProviderFiles = previous.declared
      providerOrder = previous.order
      patchOrder = previous.patchOrder
      disabledPatchKeys = previous.disabled
      generation = previous.generation
      transformCache = previous.cache
      patchStatuses = previous.statuses
      semanticBindings = previous.bindings
      pendingStatusGenerations.delete(candidateGeneration)
      for (const restore of [...stagedProviderCaches.values()].reverse()) restore()
      stagedProviderCaches.clear()
      refreshWatchedFiles?.()
      retainGeneration(previous.generation)
      active = false
    },
  }
}

export function beginProfileUpdate(input: {
  order?: string[]
  patchOrder?: string[]
  disabled?: string[]
}): ProfileTransaction {
  const previous = {
    order: providerOrder,
    patchOrder,
    disabled: disabledPatchKeys,
    generation,
    cache: transformCache,
    statuses: patchStatuses,
    bindings: semanticBindings,
  }
  const order = pinHarmonyOrder(input.order ?? providerOrder)
  const nextPatchOrder = input.patchOrder !== undefined
    ? reconcilePatchOrder(input.patchOrder, order, providers.values())
    : input.order !== undefined
      ? groupHarmonyPatchOrder(order, patchOrder)
      : [...patchOrder]
  if (input.patchOrder !== undefined
    && (nextPatchOrder.length !== input.patchOrder.length
      || nextPatchOrder.some((key, index) => key !== input.patchOrder![index]))) {
    throw new Error('dsh-harmony: profile patchOrder must be a complete permutation of registered Patches')
  }
  const disabled = new Set(input.disabled ?? disabledPatchKeys)
  preflight(nextPatchOrder, disabled)

  providerOrder = order
  patchOrder = nextPatchOrder
  disabledPatchKeys = disabled
  generation = ++generationSequence
  const candidateGeneration = generation
  pendingStatusGenerations.add(candidateGeneration)
  transformCache = new Map()
  semanticBindings = new Map(previous.bindings)
  resetPatchStatuses()
  snapshotGeneration(previous.generation)
  let active = true
  return {
    generation: candidateGeneration,
    profile: { ...currentProfile(), order, patchOrder: nextPatchOrder, disabled: [...disabled] },
    targets: allTargets(),
    commit() {
      if (!active) return
      pruneSemanticBindings(candidateGeneration)
      saveHarmonyState(activeProfileDir!, { order, patchOrder: nextPatchOrder, disabled: [...disabled] })
      retainGeneration(candidateGeneration)
      pendingStatusGenerations.delete(candidateGeneration)
      active = false
    },
    rollback() {
      if (!active) return
      providerOrder = previous.order
      patchOrder = previous.patchOrder
      disabledPatchKeys = previous.disabled
      generation = previous.generation
      transformCache = previous.cache
      patchStatuses = previous.statuses
      semanticBindings = previous.bindings
      pendingStatusGenerations.delete(candidateGeneration)
      retainGeneration(previous.generation)
      active = false
    },
  }
}

export function watchProfile(onChange: () => void | Promise<void>, onError: (error: unknown) => void): () => void {
  if (activeProfileDir === undefined) return () => {}
  const manifest = join(activeProfileDir, 'package.json')
  const order = join(activeProfileDir, HARMONY_STATE_FILE)
  let watched = new Set<string>()
  const refreshWatches = (): void => {
    const next = new Set([manifest, order])
    for (const filename of declaredProviderFiles) next.add(filename)
    for (const provider of providers.values()) {
      next.add(join(provider.info.dir, 'package.json'))
      for (const filename of provider.files) next.add(filename)
    }
    for (const filename of watched) if (!next.has(filename)) unwatchFile(filename, reload)
    for (const filename of next) if (!watched.has(filename)) watchFile(filename, { interval: 500 }, reload)
    watched = next
  }
  const reload = (): void => {
    try {
      Promise.resolve(onChange()).catch(onError)
    } catch (error) {
      onError(error)
    }
  }
  refreshWatchedFiles = refreshWatches
  refreshWatches()
  return () => {
    for (const filename of watched) unwatchFile(filename, reload)
    if (refreshWatchedFiles === refreshWatches) refreshWatchedFiles = undefined
  }
}

export function subscribe(listener: (targets: PatchTargets, generation: number) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function subscribePatchStatuses(listener: () => void): () => void {
  patchStatusListeners.add(listener)
  return () => patchStatusListeners.delete(listener)
}

function orderedPatches(input: RegisteredPatch[], order = patchOrder): RegisteredPatch[] {
  const rank = new Map(order.map((key, index) => [key, index]))
  return input.sort((a, b) => (rank.get(a.key) ?? Number.MAX_SAFE_INTEGER)
    - (rank.get(b.key) ?? Number.MAX_SAFE_INTEGER) || a.index - b.index)
}

function parse(filename: string, source: string): ts.SourceFile {
  const scriptKind = filename.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : /\.(?:cts|mts|ts)$/.test(filename)
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS
  return ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, scriptKind)
}

function customizeSettings(filename: string, source: string): string {
  const sourceFile = parse(filename, source)
  const edit = new MagicString(source)
  const settingsPanel = tsquery(sourceFile, 'FunctionDeclaration').find((node) => {
    const declaration = node as ts.FunctionDeclaration
    return declaration.name?.text === 'SettingsPanel'
  }) as ts.FunctionDeclaration
  const panelClass = tsquery(settingsPanel, 'PropertyAssignment').find((node) => {
    const property = node as ts.PropertyAssignment
    return property.name.getText(sourceFile) === 'className'
      && property.initializer.getText(sourceFile) === 'SettingsRoot_module_css_default.panel'
  }) as ts.PropertyAssignment
  edit.overwrite(panelClass.initializer.getStart(sourceFile), panelClass.initializer.getEnd(),
    'SettingsRoot_module_css_default.panel + " dshHarmonySettingsPanel"')
  const navIcon = tsquery(sourceFile, 'FunctionDeclaration').find((node) => {
    const declaration = node as ts.FunctionDeclaration
    return declaration.name?.text === 'navIcon'
  }) as ts.FunctionDeclaration
  edit.prependLeft(navIcon.body!.getStart(sourceFile) + 1, `
\t\t\tif (id === "harmony") return (0, react_jsx_runtime.jsx)("span", {
\t\t\t\tclassName: SettingsRoot_module_css_default.navIcon + " dshHarmonyNavIcon",
\t\t\t\t"aria-hidden": true
\t\t\t});`)
  const close = tsquery(sourceFile, 'VariableDeclaration').find((node) => {
    const declaration = node as ts.VariableDeclaration
    return ts.isIdentifier(declaration.name) && declaration.name.text === 'close'
  }) as ts.VariableDeclaration
  const closeCallback = tsquery(close, 'ArrowFunction')[0] as ts.ArrowFunction
  edit.prependLeft(closeCallback.getStart(sourceFile), 'async ')
  edit.prependLeft(closeCallback.body.getStart(sourceFile) + 1, `
        const harmonyGuard = globalThis.__dshHarmonyBeforeSettingsClose;
        if (harmonyGuard && !await harmonyGuard()) return;`)
  const onSelect = tsquery(sourceFile, 'PropertyAssignment').find((node) => {
    const property = node as ts.PropertyAssignment
    return property.name.getText(sourceFile) === 'onSelect' && property.initializer.getText(sourceFile) === 'setActiveId'
  }) as ts.PropertyAssignment
  edit.overwrite(onSelect.initializer.getStart(sourceFile), onSelect.initializer.getEnd(), `async (id) => {
          const harmonyGuard = globalThis.__dshHarmonyBeforeSettingsClose;
          if (harmonyGuard && !await harmonyGuard()) return;
          setActiveId(id);
        }`)
  return edit.toString()
}

function matches(filename: string, source: string, selector: string): boolean {
  return tsquery(parse(filename, source), selector).length > 0
}

function conflictOwner(filename: string, original: string, selector: string, history: Array<{ owner: string; source: string }>): string | undefined {
  let hadMatch = matches(filename, original, selector)
  let conflict: string | undefined
  for (const step of history) {
    const hasMatch = matches(filename, step.source, selector)
    if (hadMatch && !hasMatch) conflict = step.owner
    hadMatch = hasMatch
  }
  return conflict
}

function expectedMatches(registered: RegisteredPatch, patch: HarmonyPatch, matches: number, target: string): void {
  const expected = 'expect' in patch ? patch.expect : undefined
  if (expected === undefined && matches > 0 || expected === matches) return
  const wanted = expected === undefined ? 'at least 1' : String(expected)
  throw new Error(`dsh-harmony: patch ${JSON.stringify(registered.key)} expected ${wanted} match(es) in ${target}, found ${matches}`)
}

function applySourcePatch(
  filename: string,
  target: string,
  source: string,
  original: string,
  registered: RegisteredPatch,
  patch: HarmonySourcePatch,
  history: Array<{ owner: string; source: string }>,
): { source: string; matches: number } {
  const sourceFile = parse(filename, source)
  const nodes = tsquery(sourceFile, patch.select)
  try {
    expectedMatches(registered, patch, nodes.length, target)
  } catch (error) {
    if (nodes.length === 0) {
      const conflicting = conflictOwner(filename, original, patch.select, history)
      const reason = conflicting === undefined
        ? 'the selector matched no code in the original target'
        : `plugin ${JSON.stringify(conflicting)} removed or changed the selected code`
      throw Object.assign(new Error([
        `dsh-harmony: patch ${JSON.stringify(registered.key)} could not patch ${target}`,
        `  selector: ${patch.select}`,
        `  conflict: ${reason}`,
      ].join('\n')), { matches: nodes.length })
    }
    throw Object.assign(error as Error, { matches: nodes.length })
  }
  const edit = new MagicString(source)
  try {
    for (const node of nodes) patch.apply({
      patch: { key: registered.key, owner: registered.owner },
      source,
      sourceFile,
      node,
      edit,
      ts,
    })
  } catch (cause) {
    const applied = [...new Set(history.map(step => step.owner))]
    throw new Error([
      `dsh-harmony: patch ${JSON.stringify(registered.key)} failed while patching ${target}`,
      `  selector: ${patch.select}`,
      `  already applied: ${applied.length === 0 ? '(none)' : applied.join(', ')}`,
      `  error: ${cause instanceof Error ? cause.message : String(cause)}`,
    ].join('\n'), { cause })
  }
  return { source: edit.toString(), matches: nodes.length }
}

interface SourceTraceMetadata {
  key: string
  owner: string
  effect: NonNullable<HarmonySourcePatch['trace']>['effect']
  declaration: string
  target: { package: string; file: string }
  confidence: 'candidate'
}

interface BoundSourceTrace {
  registered: RegisteredPatch
  patch: HarmonySourcePatch
}

function jsxRuntimeExpression(sourceFile: ts.SourceFile, node: ts.Node, source: string): string | undefined {
  if (!ts.isCallExpression(node)) return undefined
  let expression: ts.Expression = node.expression
  while (ts.isParenthesizedExpression(expression)) expression = expression.expression
  if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.CommaToken
    || !ts.isPropertyAccessExpression(expression.right)
    || (expression.right.name.text !== 'jsx' && expression.right.name.text !== 'jsxs')) return undefined
  return source.slice(expression.right.expression.getStart(sourceFile), expression.right.expression.getEnd())
}

function instrumentSourceTraces(
  filename: string,
  source: string,
  target: { package: string; file: string },
  patches: BoundSourceTrace[],
): string {
  if (process.env.DSH_HARMONY_REACT_TRACE !== '1' || patches.length === 0) return source
  const sourceFile = parse(filename, source)
  const traced = new Map<string, { node: ts.CallExpression; runtime: string; traces: SourceTraceMetadata[] }>()
  for (const { registered, patch } of patches) {
    const trace = patch.trace
    if (trace === undefined) continue
    let nodes: ts.Node[]
    try {
      nodes = tsquery(sourceFile, trace.select)
    } catch {
      continue
    }
    if (nodes.length === 0 || nodes.length > trace.maxMatches) continue
    for (const node of nodes) {
      const runtime = jsxRuntimeExpression(sourceFile, node, source)
      if (!ts.isCallExpression(node) || runtime === undefined) continue
      const key = `${node.getStart(sourceFile)}:${node.getEnd()}`
      const current = traced.get(key) ?? { node, runtime, traces: [] }
      current.traces.push({
        key: registered.key,
        owner: registered.owner,
        effect: trace.effect,
        declaration: registered.declaration,
        target,
        confidence: 'candidate',
      })
      traced.set(key, current)
    }
  }
  if (traced.size === 0) return source

  const helper = uniqueIdentifier(sourceFile, '__dshHarmonyPatchTrace')
  const edit = new MagicString(source)
  for (const { node, runtime, traces } of traced.values()) {
    const key = node.arguments[2]
    const keyArgument = key === undefined ? '' : `, ${source.slice(key.getStart(sourceFile), key.getEnd())}`
    edit.prependLeft(
      node.getStart(sourceFile),
      `(0, ${runtime}.jsx)(${helper}, { traces: ${JSON.stringify(traces)}, children: `,
    )
    edit.appendRight(node.getEnd(), ` }${keyArgument})`)
  }
  const firstStatement = sourceFile.statements.find(statement => !ts.isExpressionStatement(statement)
    || !ts.isStringLiteral(statement.expression))
  const insertion = firstStatement?.getStart(sourceFile) ?? source.length
  edit.appendLeft(insertion, `function ${helper}(props){return props.children}\n${helper}.__dshHarmonyPatchTrace=true;\n`)
  return edit.toString()
}

type SemanticFunction = ts.FunctionDeclaration | ts.MethodDeclaration

function semanticName(node: SemanticFunction): string | undefined {
  if (ts.isFunctionDeclaration(node)) return node.name?.text
  const name = node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) ? node.name.text : undefined
  if (name === undefined) return undefined
  const parent = node.parent
  if (ts.isClassDeclaration(parent) || ts.isClassExpression(parent)) return parent.name === undefined ? name : `${parent.name.text}.${name}`
  return name
}

function semanticFunctions(sourceFile: ts.SourceFile, requested: string): SemanticFunction[] {
  const found: SemanticFunction[] = []
  const visit = (node: ts.Node): void => {
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node))
      && (semanticName(node) === requested || !requested.includes('.') && node.name?.getText(sourceFile) === requested)) found.push(node)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

function uniqueIdentifier(node: ts.Node, base: string): string {
  const names = new Set<string>()
  const visit = (current: ts.Node): void => {
    if (ts.isIdentifier(current)) names.add(current.text)
    ts.forEachChild(current, visit)
  }
  visit(node)
  let name = base
  let suffix = 0
  while (names.has(name)) name = `${base}${++suffix}`
  return name
}

function semanticMatchCount(
  filename: string,
  source: string,
  functionName: string,
  registered: RegisteredPatch,
  patch: HarmonySemanticPatch,
): number {
  const count = semanticFunctions(parse(filename, source), functionName).length
  expectedMatches(registered, patch, count, `${patch.target.package}/${relative(packageFor(filename)!.dir, filename)}`)
  return count
}

function assertNoReplaceConflict(functionName: string, registered: BoundSemanticPatch[]): void {
  const replacements = registered.filter(item => item.patch.operation === 'replace')
  if (replacements.length > 1) {
    throw new Error(`dsh-harmony: replace conflict in ${functionName}: ${replacements.map(item => item.registered.key).join(', ')}`)
  }
}

function instrumentSemantic(
  filename: string,
  source: string,
  functionName: string,
  registered: RegisteredPatch,
  patch: HarmonySemanticPatch,
  bindingKey: string,
): { source: string; matches: number; bindingKey: string } {
  const sourceFile = parse(filename, source)
  const nodes = semanticFunctions(sourceFile, functionName)
  expectedMatches(registered, patch, nodes.length, `${patch.target.package}/${relative(packageFor(filename)!.dir, filename)}`)
  const edit = new MagicString(source)
  for (const node of nodes) {
    if (node.asteriskToken !== undefined) throw new Error(`dsh-harmony: semantic patches do not support generator ${functionName}`)
    if (node.body === undefined) throw new Error(`dsh-harmony: semantic target ${functionName} has no body`)
    const argsName = uniqueIdentifier(node, '__dshHarmonyArgs')
    const indexName = uniqueIdentifier(node, '__dshHarmonyIndex')
    const lengthName = uniqueIdentifier(node, '__dshHarmonyLength')
    const changedName = uniqueIdentifier(node, '__dshHarmonyChanged')
    const assignments = node.parameters.map((parameter, index) => {
      if (!ts.isIdentifier(parameter.name)) throw new Error(`dsh-harmony: semantic target ${functionName} requires named parameters`)
      return parameter.dotDotDotToken === undefined
        ? `${parameter.name.text} = ${parameter.initializer === undefined
          ? `${argsName}[${index}]`
          : `${argsName}[${index}] === undefined ? ${parameter.initializer.getText(sourceFile)} : ${argsName}[${index}]`};`
        : `${parameter.name.text} = ${argsName}.slice(${index});`
    }).join('')
    const synchronizeArguments = `const ${lengthName}=arguments.length;for(let ${indexName}=${argsName}.length;${indexName}<${lengthName};${indexName}++)delete arguments[${indexName}];for(let ${indexName}=0;${indexName}<${argsName}.length;${indexName}++)arguments[${indexName}]=${argsName}[${indexName}];arguments.length=${argsName}.length;`
    const synchronizeParameters = `const ${changedName}=${argsName}.length!==arguments.length||${argsName}.some((${argsName},${indexName})=>${argsName}!==arguments[${indexName}]);if(${changedName}){${synchronizeArguments}${assignments}}`
    const body = source.slice(node.body.getStart(sourceFile) + 1, node.body.getEnd() - 1)
    const callback = node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword) ? 'async ' : ''
    edit.overwrite(node.body.getStart(sourceFile) + 1, node.body.getEnd() - 1,
      `return globalThis.__dshHarmonyInvoke(${JSON.stringify(bindingKey)}, this, Array.from(arguments), ${callback}(${argsName}) => {${synchronizeParameters}${body}});`)
  }
  return { source: edit.toString(), matches: nodes.length, bindingKey }
}

function resolvedTargetFile(patch: HarmonyPatch, pkg: PackageInfo): string | undefined {
  return patch.target.files.find(file => existsSync(join(pkg.dir, file)))
}

function versionError(patch: HarmonyPatch, pkg: PackageInfo): string | undefined {
  const range = patch.target.version
  if (range === undefined || semver.satisfies(pkg.version, range, { includePrerelease: true })) return undefined
  return `target ${pkg.name}@${pkg.version} does not satisfy ${range}`
}

interface WorkingTransform {
  filename: string
  source: string
  pkg: PackageInfo
  relativeFile: string
  target: string
  original: string
  output: string
  steps: HarmonyPatchInspection['steps']
  history: Array<{ owner: string; source: string }>
  traceable: BoundSourceTrace[]
  semantic: Map<string, { bindingKey: string; patches: BoundSemanticPatch[] }>
}

function beginWorkingTransform(filename: string, source: string): WorkingTransform {
  const pkg = packageFor(filename)!
  const relativeFile = relative(pkg.dir, filename).replaceAll('\\', '/')
  const output = pkg.name === '@deepseek-ai/dsh-client-ui-settings-general' && relativeFile === 'lib/client.js'
    ? customizeSettings(filename, source)
    : source
  return {
    filename,
    source,
    pkg,
    relativeFile,
    target: `${pkg.name}/${relativeFile}`,
    original: output,
    output,
    steps: [],
    history: [],
    traceable: [],
    semantic: new Map(),
  }
}

function snapshotWorkingTransform(state: WorkingTransform): Omit<WorkingTransform, 'filename' | 'source' | 'pkg' | 'relativeFile' | 'target' | 'original'> {
  return {
    output: state.output,
    steps: [...state.steps],
    history: [...state.history],
    traceable: [...state.traceable],
    semantic: new Map([...state.semantic].map(([name, value]) => [name, {
      bindingKey: value.bindingKey,
      patches: [...value.patches],
    }])),
  }
}

function restoreWorkingTransform(
  state: WorkingTransform,
  snapshot: ReturnType<typeof snapshotWorkingTransform>,
): void {
  state.output = snapshot.output
  state.steps = snapshot.steps
  state.history = snapshot.history
  state.traceable = snapshot.traceable
  state.semantic = snapshot.semantic
}

function applyRegisteredPatch(
  state: WorkingTransform,
  registered: RegisteredPatch,
  members: HarmonyPatch[],
  transformGeneration: number,
): number {
  let matches = 0
  for (const patch of members) {
    if (patchKind(patch) === 'loader') {
      matches += 1
      continue
    }
    if (patchKind(patch) === 'semantic') {
      const semanticPatch = patch as HarmonySemanticPatch
      if (state.relativeFile === 'lib/client.js') {
        throw new Error(`dsh-harmony: semantic patch ${JSON.stringify(registered.key)} targets a browser bundle; use a source patch for lib/client.js`)
      }
      const functionName = semanticPatch.target.function
      const current = state.semantic.get(functionName)
      const bound = { registered, patch: semanticPatch }
      if (current === undefined) {
        const bindingKey = `${transformGeneration}\0${state.filename}\0${functionName}`
        const result = instrumentSemantic(
          state.filename,
          state.output,
          functionName,
          registered,
          semanticPatch,
          bindingKey,
        )
        state.output = result.source
        matches += result.matches
        state.semantic.set(functionName, { bindingKey, patches: [bound] })
      } else {
        matches += semanticMatchCount(state.filename, state.output, functionName, registered, semanticPatch)
        assertNoReplaceConflict(functionName, [...current.patches, bound])
        current.patches.push(bound)
      }
      continue
    }
    const sourcePatch = patch as HarmonySourcePatch
    const result = applySourcePatch(
      state.filename,
      state.target,
      state.output,
      state.original,
      registered,
      sourcePatch,
      state.history,
    )
    state.output = result.source
    matches += result.matches
    if (sourcePatch.trace !== undefined) state.traceable.push({ registered, patch: sourcePatch })
  }
  state.history.push({ owner: registered.owner, source: state.output })
  state.steps.push({ key: registered.key, owner: registered.owner, matches, source: state.output })
  return matches
}

function finishWorkingTransform(
  state: WorkingTransform,
  transformGeneration: number,
  bind: boolean,
): TransformRecord {
  if (bind) {
    for (const value of state.semantic.values()) semanticBindings.set(value.bindingKey, [...value.patches])
  }
  const runtimeOutput = instrumentSourceTraces(
    state.filename,
    state.output,
    { package: state.pkg.name, file: state.relativeFile },
    state.traceable,
  )
  return {
    filename: state.filename,
    generation: transformGeneration,
    packageVersion: state.pkg.version,
    source: state.source,
    output: runtimeOutput,
    inspection: {
      package: state.pkg.name,
      file: state.relativeFile,
      original: state.source,
      final: state.output,
      steps: state.steps,
    },
  }
}

function buildTransform(
  filename: string,
  source: string,
  order = patchOrder,
  disabled = disabledPatchKeys,
  bind = true,
  records: Iterable<ProviderRecord> = providers.values(),
  transformGeneration = generation,
): TransformRecord {
  const state = beginWorkingTransform(filename, source)
  const { pkg, relativeFile } = state
  const candidates = orderedPatches([...records].flatMap(provider => provider.patches), order)
    .filter(registered => registered.members.some(patch => patch.target.package === pkg.name))
  const recordStatus = bind && transformGeneration === generation
  const applicable: Array<{ registered: RegisteredPatch; members: HarmonyPatch[] }> = []
  for (const registered of candidates) {
    if (recordStatus) updateStatus(registered, { loaded: true, generation: transformGeneration })
    if (isPatchDisabled(registered, disabled)) {
      if (recordStatus) updateStatus(registered, { state: 'disabled', matches: 0, error: undefined, file: undefined, generation: transformGeneration })
      continue
    }
    const members: HarmonyPatch[] = []
    let memberError: string | undefined
    for (const patch of registered.members.filter(patch => patch.target.package === pkg.name)) {
      const incompatible = versionError(patch, pkg)
      const file = resolvedTargetFile(patch, pkg)
      if (incompatible !== undefined || file === undefined) {
        memberError = incompatible ?? `none of the target files exist: ${patch.target.files.join(', ')}`
        break
      }
      if (file === relativeFile) members.push(patch)
    }
    if (memberError !== undefined) {
      if (recordStatus) updateStatus(registered, {
        state: 'failed', matches: 0, error: memberError, generation: transformGeneration,
      })
      continue
    }
    if (members.length > 0) applicable.push({ registered, members })
  }

  for (const { registered, members } of applicable) {
    const snapshot = snapshotWorkingTransform(state)
    try {
      const matches = applyRegisteredPatch(state, registered, members, transformGeneration)
      if (recordStatus) updateStatus(registered, {
        state: 'bound', matches, file: relativeFile, error: undefined, generation: transformGeneration,
      })
    } catch (error) {
      restoreWorkingTransform(state, snapshot)
      if (recordStatus) updateStatus(registered, {
        state: 'failed', matches: (error as { matches?: number }).matches ?? 0, file: relativeFile,
        error: error instanceof Error ? error.message : String(error), generation: transformGeneration,
      })
    }
  }
  return finishWorkingTransform(state, transformGeneration, bind)
}

function preflight(order: string[], disabled: Set<string>): void {
  for (const cached of transformCache.values()) {
    if (cached.generation === generation) buildTransform(cached.filename, cached.source, order, disabled, false)
  }
}

function isJavaScript(filename: string): boolean {
  return /\.[cm]?js$/.test(filename)
}

function isTypeScript(filename: string): boolean {
  return /\.(?:cts|mts|ts|tsx)$/.test(filename)
}

function isSourceFile(filename: string): boolean {
  return isJavaScript(filename) || isTypeScript(filename)
}

function canonicalFilename(filename: string): string {
  return realpathSync(filename)
}

function beginModuleSourceLoad(filename: string): void {
  moduleSourcesLoading.set(filename, (moduleSourcesLoading.get(filename) ?? 0) + 1)
}

function endModuleSourceLoad(filename: string): void {
  const count = moduleSourcesLoading.get(filename)!
  if (count === 1) moduleSourcesLoading.delete(filename)
  else moduleSourcesLoading.set(filename, count - 1)
}

function activeTypeScriptLoader(
  filename: string,
  requestedGeneration: number,
): PackageInfo | undefined {
  if (!isTypeScript(filename)) return undefined
  packageCache.clear()
  const pkg = packageFor(filename)
  const state = generationStates.get(requestedGeneration)
  if (pkg === undefined || state === undefined) return undefined
  const recordStatus = requestedGeneration === generation
  let active = false
  const candidates = orderedPatches([...state.providers].flatMap(provider => provider.patches), state.patchOrder)
    .filter(registered => registered.members.some(patch => patchKind(patch) === 'loader'
      && (patch as HarmonyLoaderPatch).loader === 'typescript'
      && patch.target.package === pkg.name))
  if (recordStatus && activeProfileDir !== undefined && candidates.some(registered => registered.members.length > 1
    && (patchStatuses.get(registered.key)?.state ?? 'pending') === 'pending')) {
    inspectTargets(state.patchOrder, state.disabled, true, true)
  }
  for (const registered of candidates) {
    if (recordStatus) updateStatus(registered, { loaded: true, generation: requestedGeneration })
    if (isPatchDisabled(registered, state.disabled)) {
      if (recordStatus) updateStatus(registered, {
        state: 'disabled', matches: 0, error: undefined, file: undefined, generation: requestedGeneration,
      })
      continue
    }
    if (registered.members.length > 1 && recordStatus) {
      const compositeState = patchStatuses.get(registered.key)?.state
      if (compositeState === 'failed') continue
      if (compositeState === 'bound') {
        active = true
        continue
      }
    }
    const loaders = registered.members.filter(patch => patchKind(patch) === 'loader'
      && patch.target.package === pkg.name) as HarmonyLoaderPatch[]
    const incompatible = loaders.map(patch => versionError(patch, pkg)).find(error => error !== undefined)
    if (incompatible !== undefined) {
      if (recordStatus) updateStatus(registered, {
        state: 'failed', matches: 0, error: incompatible, file: undefined, generation: requestedGeneration,
      })
      continue
    }
    const files = loaders.map(patch => resolvedTargetFile(patch, pkg))
    if (files.some(file => file === undefined)) {
      if (recordStatus) updateStatus(registered, {
        state: 'failed', matches: 0,
        error: `none of the target files exist: ${loaders.find((_, index) => files[index] === undefined)!.target.files.join(', ')}`,
        file: undefined,
        generation: requestedGeneration,
      })
      continue
    }
    active = true
    if (recordStatus) updateStatus(registered, {
      state: 'bound', matches: loaders.length, file: files[0], error: undefined, generation: requestedGeneration,
    })
  }
  return active ? pkg : undefined
}

function resolveTypeScriptDependency(
  specifier: string,
  parentUrl: string | undefined,
  requestedGeneration: number,
): string | undefined {
  if (!specifier.startsWith('.') || parentUrl === undefined || !parentUrl.startsWith('file:')) return undefined
  const parent = canonicalFilename(fileURLToPath(parentUrl))
  const parentPackage = activeTypeScriptLoader(parent, requestedGeneration)
  if (parentPackage === undefined) return undefined
  const resolved = ts.resolveModuleName(
    specifier,
    parent,
    { allowJs: true, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext },
    ts.sys,
  ).resolvedModule?.resolvedFileName
  if (resolved === undefined || !isTypeScript(resolved) || /\.d\.[cm]?ts$/.test(resolved)) return undefined
  const filename = canonicalFilename(resolved)
  return packageFor(filename)?.dir === parentPackage.dir ? filename : undefined
}

function transpileTypeScript(filename: string, source: string, pkg: PackageInfo): {
  format: 'module' | 'commonjs'
  source: string
} {
  const format = filename.endsWith('.cts') || !filename.endsWith('.mts') && pkg.type !== 'module'
    ? 'commonjs'
    : 'module'
  return {
    format,
    source: ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: {
        target: ts.ScriptTarget.ES2023,
        module: format === 'commonjs' ? ts.ModuleKind.CommonJS : ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
  }
}

function hasTypelessEsmSyntax(filename: string): boolean {
  const sourceFile = parse(filename, nativeReadFileSync(filename, 'utf8'))
  if (ts.isExternalModule(sourceFile)) return true
  let topLevelAwait = false
  const visit = (node: ts.Node): void => {
    if (topLevelAwait || node !== sourceFile && ts.isFunctionLike(node)) return
    if (ts.isAwaitExpression(node)) {
      topLevelAwait = true
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  if (topLevelAwait) return true
  const wrapperNames = new Set(['require', 'module', 'exports', '__dirname', '__filename'])
  return sourceFile.statements.some(statement => {
    if (ts.isClassDeclaration(statement)) return statement.name !== undefined && wrapperNames.has(statement.name.text)
    if (!ts.isVariableStatement(statement) || !(statement.declarationList.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const))) return false
    return statement.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name) && wrapperNames.has(declaration.name.text))
  })
}

function transform(filename: string, source: string, requestedGeneration = generation): string {
  if (!isSourceFile(filename)) return source
  filename = canonicalFilename(filename)
  if (loadedPatchFiles.has(filename) || loadingPatchFiles.has(filename)) return source
  const cacheKey = `${requestedGeneration}\0${filename}`
  if (transformationsInProgress.has(cacheKey)) return source
  let cached = transformCache.get(cacheKey)
  const state = generationStates.get(requestedGeneration)
  if (cached === undefined && requestedGeneration === generation && activeProfileDir !== undefined
    && state?.providers.some(provider => provider.patches.some(patch => patch.members.length > 1))) {
    inspectTargets(state.patchOrder, state.disabled, true, true)
    cached = transformCache.get(cacheKey)
  }
  transformationsInProgress.add(cacheKey)
  try {
    packageCache.clear()
    const pkg = packageFor(filename)
    if (pkg === undefined) return source
    if (cached?.packageVersion === pkg.version && cached.source === source) return cached.output
    if (state === undefined) return source
    const result = buildTransform(
      filename,
      source,
      state.patchOrder,
      state.disabled,
      true,
      state.providers,
      requestedGeneration,
    )
    transformCache.set(cacheKey, result)
    return result.output
  } finally {
    transformationsInProgress.delete(cacheKey)
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function'
}

function invokeSemantic(bindingKey: string, self: unknown, initialArgs: unknown[], original: (args: unknown[]) => unknown): unknown {
  const patches = semanticBindings.get(bindingKey) ?? []
  const before = patches.filter(item => item.patch.operation === 'before')
  const decorators = patches.filter(item => {
    const operation = item.patch.operation
    return operation === 'around' || operation === 'replace'
  })
  const after = patches.filter(item => item.patch.operation === 'after')

  const runBefore = (index: number, args: unknown[]): unknown[] | PromiseLike<unknown> => {
    if (index === before.length) return args
    const patch = before[index]!.patch
    const changed = patch.handler({ args, self, invoke: next => runBefore(index + 1, next ?? args) })
    const proceed = (value: unknown): unknown[] | PromiseLike<unknown> => runBefore(index + 1, Array.isArray(value) ? value : args)
    return isPromiseLike(changed) ? changed.then(proceed) : proceed(changed)
  }

  const runDecorators = (index: number, args: unknown[]): unknown => {
    if (index === decorators.length) return original(args)
    const patch = decorators[index]!.patch
    return patch.handler({ args, self, invoke: next => runDecorators(index + 1, next ?? args) })
  }

  const runAfter = (index: number, result: unknown): unknown => {
    if (index === after.length) return result
    const patch = after[index]!.patch
    const changed = patch.handler({ args: initialArgs, self, result, invoke: () => result })
    const proceed = (value: unknown): unknown => runAfter(index + 1, value === undefined ? result : value)
    return isPromiseLike(changed) ? changed.then(proceed) : proceed(changed)
  }

  const execute = (args: unknown[]): unknown => {
    const result = runDecorators(0, args)
    return isPromiseLike(result) ? result.then(value => runAfter(0, value)) : runAfter(0, result)
  }
  const args = runBefore(0, initialArgs)
  return isPromiseLike(args) ? args.then(value => execute(value as unknown[])) : execute(args)
}

;(globalThis as typeof globalThis & { __dshHarmonyInvoke?: typeof invokeSemantic }).__dshHarmonyInvoke = invokeSemantic

export function getPatchStatuses(): HarmonyPatchStatus[] {
  return orderedPatches([...providers.values()].flatMap(provider => provider.patches))
    .map(registered => patchStatuses.get(registered.key) ?? freshStatus(registered))
}

export function getPatchOrderViolations(): ReturnType<typeof patchOrderViolations> {
  const profile = currentProfile()
  return patchOrderViolations(
    patchOrder,
    [...providers.values()].flatMap(provider => provider.patches).map(orderItem),
    profile.plugins,
  )
}

export function getPatchInspections(packageName?: string, file?: string): HarmonyPatchInspection[] {
  return [...transformCache.values()].filter(record => record.generation === generation).map(record => record.inspection)
    .filter(item => (packageName === undefined || item.package === packageName) && (file === undefined || item.file === file))
}

export function inspectPatchDependencies(owner: string): HarmonyPatchDependency[] {
  const registered = new Map([...providers.values()].flatMap(provider => provider.patches).map(item => [item.key, item]))
  const dependencies: HarmonyPatchDependency[] = []
  for (const record of transformCache.values()) {
    if (record.generation !== generation) continue
    const pkg = packageFor(record.filename)!
    const relativeFile = relative(pkg.dir, record.filename).replaceAll('\\', '/')
    const target = `${pkg.name}/${relativeFile}`
    const base = pkg.name === '@deepseek-ai/dsh-client-ui-settings-general' && relativeFile === 'lib/client.js'
      ? customizeSettings(record.filename, record.source)
      : record.source
    const previousOwners: string[] = []
    for (const step of record.inspection.steps) {
      if (step.owner === owner) {
        const item = registered.get(step.key)
        for (const patch of item?.members ?? []) {
          if (patchKind(patch) !== 'source' || patch.target.package !== pkg.name) continue
          try {
            applySourcePatch(record.filename, target, base, base, item!, patch as HarmonySourcePatch, [])
          } catch (error) {
            const candidates = [...new Set(previousOwners.filter(candidate => candidate !== owner))]
            if (candidates.length > 0) dependencies.push({
              patch: item!.key,
              target: { package: pkg.name, file: relativeFile },
              providerCandidates: candidates,
              reason: error instanceof Error ? error.message : String(error),
            })
          }
        }
      }
      previousOwners.push(step.owner)
    }
  }
  return dependencies
}

export function inspectPatchTargets(continueOnError = false): HarmonyPatchInspection[] {
  inspectTargets(patchOrder, disabledPatchKeys, continueOnError, true)
  return getPatchInspections()
}

function inspectTargets(order: string[], disabled: Set<string>, _continueOnError: boolean, bind: boolean): void {
  const profileManifest = pathToFileURL(join(activeProfileDir!, 'package.json'))
  const allPatches = orderedPatches([...providers.values()].flatMap(provider => provider.patches), order)
  const targetPackages = new Set(allPatches.flatMap(item => item.members.map(patch => patch.target.package)))
  const working = new Map<string, WorkingTransform>()
  const applications = new Map<string, Map<string, HarmonyPatch[]>>()
  const failures = new Map<string, string>()
  const unavailable = new Set<string>()
  const loaded = new Set<string>()
  for (const packageName of targetPackages) {
    let manifest: string | undefined
    try {
      manifest = findPackageJSON(packageName, profileManifest)
    } catch {}
    if (manifest === undefined) {
      const error = `dsh-harmony: target package ${JSON.stringify(packageName)} is not installed`
      for (const item of allPatches.filter(registered => registered.members.some(patch => patch.target.package === packageName))) {
        failures.set(item.key, error)
        unavailable.add(item.key)
      }
      continue
    }
    const pkg = readPackageInfo(dirname(manifest))
    packageCache.set(pkg.dir, pkg)
    for (const item of allPatches) {
      const members = item.members.filter(patch => patch.target.package === packageName)
      if (members.length === 0) continue
      loaded.add(item.key)
      for (const patch of members) {
        const incompatible = versionError(patch, pkg)
        const file = resolvedTargetFile(patch, pkg)
        if (incompatible !== undefined || file === undefined) {
          failures.set(item.key, incompatible ?? `none of the target files exist: ${patch.target.files.join(', ')}`)
          continue
        }
        const filename = join(pkg.dir, file)
        if (!working.has(filename)) {
          working.set(filename, beginWorkingTransform(filename, nativeReadFileSync(filename, 'utf8')))
        }
        const files = applications.get(item.key) ?? new Map<string, HarmonyPatch[]>()
        const applicable = files.get(filename) ?? []
        applicable.push(patch)
        files.set(filename, applicable)
        applications.set(item.key, files)
      }
    }
  }

  const outcomes = new Map<string, { matches: number; files: string[]; error?: string }>()
  const scheduled = allPatches.filter(item => !disabled.has(item.key)
    && !disabled.has(`${item.owner}/*`)
    && !failures.has(item.key)
    && applications.has(item.key))
  const batches = schedulePatchBatches(scheduled.map(item => ({
    key: item.key,
    files: [...applications.get(item.key)!.keys()],
  })))
  const byKey = new Map(allPatches.map(item => [item.key, item]))
  for (const batch of batches) {
    // Items in one batch touch disjoint file slices. Patch callbacks are synchronous,
    // so they are drained together without making unrelated files wait on one another.
    for (const key of batch) {
      const item = byKey.get(key)!
      const targets = applications.get(key)!
      const snapshots = new Map([...targets].map(([filename]) => [
        filename,
        snapshotWorkingTransform(working.get(filename)!),
      ]))
      let matches = 0
      try {
        for (const [filename, members] of targets) {
          matches += applyRegisteredPatch(working.get(filename)!, item, members, generation)
        }
        outcomes.set(key, {
          matches,
          files: [...targets.keys()].map(filename => working.get(filename)!.relativeFile),
        })
      } catch (error) {
        for (const [filename, snapshot] of snapshots) restoreWorkingTransform(working.get(filename)!, snapshot)
        const message = error instanceof Error ? error.message : String(error)
        const failedMatches = (error as { matches?: number }).matches ?? 0
        failures.set(key, message)
        outcomes.set(key, { matches: failedMatches, files: [], error: message })
      }
    }
  }

  if (bind) {
    for (const [filename, state] of working) {
      const result = finishWorkingTransform(state, generation, true)
      transformCache.set(`${generation}\0${filename}`, result)
    }
    for (const item of allPatches) {
      const disabledPatch = isPatchDisabled(item, disabled)
      const failure = failures.get(item.key)
      const outcome = outcomes.get(item.key)
      const files = outcome?.files ?? []
      updateStatus(item, disabledPatch ? {
        state: 'disabled', loaded: loaded.has(item.key) && !unavailable.has(item.key), matches: 0,
        files: [], file: undefined, error: undefined, generation,
      } : failure !== undefined ? {
        state: 'failed', loaded: loaded.has(item.key) && !unavailable.has(item.key), matches: outcome?.matches ?? 0,
        files: [], file: undefined, error: failure, generation,
      } : {
        state: 'bound', loaded: true, matches: outcome?.matches ?? 0,
        files, file: files.length === 1 ? files[0] : undefined, error: undefined, generation,
      })
    }
  }
}

export function preflightProfileUpdate(input: {
  order?: string[]
  patchOrder?: string[]
  disabled?: string[]
}): void {
  const order = input.patchOrder
    ?? (input.order === undefined ? patchOrder : groupHarmonyPatchOrder(pinHarmonyOrder(input.order), patchOrder))
  inspectTargets(
    order,
    new Set(input.disabled ?? disabledPatchKeys),
    false,
    false,
  )
}

function filenameOf(path: unknown): string | undefined {
  if (typeof path === 'string') return path
  if (Buffer.isBuffer(path)) return path.toString()
  return path instanceof URL && path.protocol === 'file:' ? fileURLToPath(path) : undefined
}

function moduleSourceText(source: string | ArrayBuffer | NodeJS.TypedArray): string {
  if (typeof source === 'string') return source
  if (source instanceof ArrayBuffer) return Buffer.from(source).toString('utf8')
  return Buffer.from(source.buffer, source.byteOffset, source.byteLength).toString('utf8')
}

function isUtf8Read(options: unknown): boolean {
  const encoding = typeof options === 'string'
    ? options
    : typeof options === 'object' && options !== null
      ? (options as { encoding?: unknown }).encoding
      : undefined
  return encoding === 'utf8' || encoding === 'utf-8'
}

export function installFileTransforms(): void {
  fs.readFileSync = ((path: Parameters<typeof fs.readFileSync>[0], ...args: unknown[]) => {
    const value = nativeReadFileSync(path, ...args as [])
    const filename = filenameOf(path)
    if (filename === undefined || !isJavaScript(filename) || (!Buffer.isBuffer(value) && typeof value !== 'string')) return value
    if (typeof value === 'string' && !isUtf8Read(args[0])) return value
    const canonical = canonicalFilename(filename)
    if (moduleSourcesLoading.has(canonical)) return value
    const output = transform(canonical, value.toString())
    return Buffer.isBuffer(value) ? Buffer.from(output) : output
  }) as typeof fs.readFileSync
  fs.promises.readFile = (async (path: Parameters<typeof fs.promises.readFile>[0], ...args: unknown[]) => {
    const value = await nativeReadFile(path, ...args as [])
    const filename = filenameOf(path)
    if (filename === undefined || !isJavaScript(filename) || (!Buffer.isBuffer(value) && typeof value !== 'string')) return value
    if (typeof value === 'string' && !isUtf8Read(args[0])) return value
    const canonical = canonicalFilename(filename)
    if (moduleSourcesLoading.has(canonical)) return value
    const output = transform(canonical, value.toString())
    return Buffer.isBuffer(value) ? Buffer.from(output) : output
  }) as typeof fs.promises.readFile
  syncBuiltinESMExports()
}

export function installModuleHooks(): void {
  if (moduleHooksInstalled) return
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'dsh-harmony') return { url: indexUrl, shortCircuit: true }
      if (specifier === 'dsh-harmony:plugin') return { url: pluginUrl, shortCircuit: true }
      if (specifier === 'dsh-harmony/package.json') return { url: manifestUrl, shortCircuit: true }
      const marker = '?dsh-harmony='
      const index = specifier.lastIndexOf(marker)
      const cleanSpecifier = index === -1 ? specifier : specifier.slice(0, index)
      let nextGeneration = index === -1 ? undefined : specifier.slice(index + marker.length)
      const inherited = context.parentURL?.startsWith('file:')
        ? new URL(context.parentURL).searchParams.get('dsh-harmony') ?? undefined
        : undefined
      let result
      try {
        result = nextResolve(cleanSpecifier, context)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error
        const filename = resolveTypeScriptDependency(
          cleanSpecifier,
          context.parentURL,
          Number(nextGeneration ?? inherited ?? generation),
        )
        if (filename === undefined) throw error
        result = { url: pathToFileURL(filename).href, shortCircuit: true }
        nextGeneration ??= inherited
      }
      if (nextGeneration === undefined && context.parentURL?.startsWith('file:') && result.url.startsWith('file:')) {
        const parentUrl = new URL(context.parentURL)
        if (inherited !== undefined) {
          const parentPackage = packageFor(fileURLToPath(parentUrl))
          const childPackage = packageFor(fileURLToPath(result.url))
          if (parentPackage?.dir === childPackage?.dir) nextGeneration = inherited
        }
      }
      if (nextGeneration === undefined) return result
      const url = new URL(result.url)
      url.searchParams.set('dsh-harmony', nextGeneration)
      return { ...result, url: url.href, shortCircuit: true }
    },
    load(url, context, nextLoad) {
      const path = url.startsWith('file:') ? fileURLToPath(url) : undefined
      const filename = path === undefined ? undefined : canonicalFilename(path)
      const requested = Number(new URL(url).searchParams.get('dsh-harmony') ?? generation)
      const loader = filename === undefined ? undefined : activeTypeScriptLoader(filename, requested)
      if (filename !== undefined && loader !== undefined) {
        const source = nativeReadFileSync(filename, 'utf8')
        const transformed = transform(filename, source, requested)
        return { ...transpileTypeScript(filename, transformed, loader), shortCircuit: true }
      }
      if (filename !== undefined) beginModuleSourceLoad(filename)
      let result
      try {
        result = nextLoad(url, context)
      } finally {
        if (filename !== undefined) endModuleSourceLoad(filename)
      }
      if (filename !== undefined && (result.format === 'module' || result.format === 'commonjs') && result.source != null) {
        return { ...result, source: transform(filename, moduleSourceText(result.source), requested) }
      }
      return result
    },
  })
  moduleHooksInstalled = true
}

export function prepareModuleReload(
  specifier: string,
  baseUrl?: string,
  packageUpdates = new Map<string, () => void>(),
): { restore(): void; load?: () => unknown } | undefined {
  const localRequire = createRequire(baseUrl ?? import.meta.url)
  const containingFile = baseUrl?.startsWith('file:') ? fileURLToPath(baseUrl) : baseUrl ?? fileURLToPath(import.meta.url)
  const filename = ts.resolveModuleName(
    specifier.replace(/\?dsh-harmony=\d+$/, ''),
    containingFile,
    { allowJs: true, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext },
    ts.sys,
    undefined,
    undefined,
    ts.ModuleKind.ESNext,
  ).resolvedModule?.resolvedFileName
  if (filename === undefined) return undefined
  packageCache.clear()
  const pkg = packageFor(filename)
  if (pkg === undefined) return undefined
  const currentRestore = packageUpdates.get(pkg.dir)
  const commonjs = filename.endsWith('.cjs') || filename.endsWith('.js') && pkg.type !== 'module' && !hasTypelessEsmSyntax(filename)
  const load = commonjs ? () => localRequire(filename) : undefined
  if (currentRestore !== undefined) return { restore: currentRestore, load }
  const stagedRestore = stagedProviderCaches.get(pkg.dir)
  if (stagedRestore !== undefined) {
    packageUpdates.set(pkg.dir, stagedRestore)
    return { restore: stagedRestore, load }
  }
  const restore = beginCommonJSCacheUpdate(cached => insideDirectory(pkg.dir, cached))
  packageUpdates.set(pkg.dir, restore)
  return { restore, load }
}

export function discoverProfile(profileDir: string): void {
  synchronizeProfile(profileDir)
}

export function packageNameOf(specifier: string): string | undefined {
  const clean = specifier.replace(/\?dsh-harmony=\d+$/, '')
  if (clean.startsWith('.') || clean.startsWith('/') || clean.startsWith('file:') || clean.includes(':')) return undefined
  return clean.startsWith('@') ? clean.split('/').slice(0, 2).join('/') : clean.split('/')[0]
}
