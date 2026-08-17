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
  HarmonyPatch,
  HarmonyPatchInspection,
  HarmonyPatchDependency,
  HarmonyPatchStatus,
  HarmonySemanticContext,
  HarmonySemanticPatch,
  HarmonySourcePatch,
} from './index.js'
import {
  HARMONY_STATE_FILE,
  pinHarmonyOrder,
  providerIncompatibilities,
  saveHarmonyState,
  synchronizeHarmonyProfile,
} from './profile.js'
import type { HarmonyProfile } from './profile.js'

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
  patch: HarmonyPatch
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
let transformCache = new Map<string, TransformRecord>()
let patchStatuses = new Map<string, HarmonyPatchStatus>()
let semanticBindings = new Map<string, RegisteredPatch[]>()
let generation = 0
let generationSequence = 0
const generationStates = new Map<number, GenerationState>([[0, { providers: [], order: [], disabled: new Set() }]])
let activeProfileDir: string | undefined
let providerOrder: string[] = []
let disabledPatchKeys = new Set<string>()
let refreshWatchedFiles: (() => void) | undefined

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
  for (const { patch } of patches) {
    for (const file of patch.target.files) addTarget(targets, patch.target.package, file)
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

function patchKind(patch: HarmonyPatch): 'source' | 'semantic' {
  return 'select' in patch ? 'source' : 'semantic'
}

function isPatchDisabled(registered: RegisteredPatch, disabled = disabledPatchKeys): boolean {
  return disabled.has(registered.key) || disabled.has(`${registered.owner}/*`)
}

function freshStatus(registered: RegisteredPatch): HarmonyPatchStatus {
  const semantic = patchKind(registered.patch) === 'semantic' ? registered.patch as HarmonySemanticPatch : undefined
  return {
    key: registered.key,
    id: registered.patch.id,
    owner: registered.owner,
    target: registered.patch.target,
    kind: patchKind(registered.patch),
    operation: semantic?.operation,
    state: isPatchDisabled(registered) ? 'disabled' : 'pending',
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
  patchStatuses.set(registered.key, next)
  if (!pendingStatusGenerations.has(next.generation)
    && (previous.state !== next.state || previous.error !== next.error)) {
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
      const exported = require(filename) as HarmonyPatch | HarmonyPatch[] | { default?: HarmonyPatch | HarmonyPatch[] }
      const value = (exported as { default?: HarmonyPatch | HarmonyPatch[] }).default ?? exported as HarmonyPatch | HarmonyPatch[]
      for (const patch of Array.isArray(value) ? value : [value]) {
        if (ids.has(patch.id)) throw new Error(`dsh-harmony: duplicate patch id ${JSON.stringify(patch.id)} in ${JSON.stringify(info.name)}`)
        ids.add(patch.id)
        registered.push({
          patch,
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
    if (activeProfileDir !== undefined) saveHarmonyState(activeProfileDir, { order: providerOrder, disabled: [...disabledPatchKeys] })
  }
  notify(targets)
}

export function synchronizeProfile(profileDir: string, installed?: string[]): HarmonyProfile {
  const previousTargets = allTargets()
  const previousOrder = providerOrder
  const previousDisabled = disabledPatchKeys
  const profile = synchronizeHarmonyProfile(profileDir, installed, false)
  const harmonyProviders = profile.plugins.filter(plugin => plugin.patches.length > 0)
  declaredProviderFiles = new Set(harmonyProviders.flatMap(provider => [
    join(provider.dir, 'package.json'),
    ...provider.patches.map(file => join(provider.dir, file)),
  ]))
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

    synchronizeHarmonyProfile(profileDir, installed)
    providers.clear()
    for (const [name, record] of nextProviders) providers.set(name, record)
    loadedPatchFiles.clear()
    for (const record of nextProviders.values()) {
      packageCache.set(record.info.dir, record.info)
      for (const filename of record.files) loadedPatchFiles.add(filename)
    }
    activeProfileDir = profileDir
    providerOrder = profile.order
    disabledPatchKeys = new Set(profile.disabled)
    if (registryChanged || orderChanged || disabledChanged) notify(changedTargets)
    return profile
  } finally {
    refreshWatchedFiles?.()
  }
}

export function currentProfile(): HarmonyProfile {
  const profile = synchronizeHarmonyProfile(activeProfileDir!, undefined, false)
  const disabled = [...disabledPatchKeys]
  const loaded = new Set(providerOrder)
  return {
    ...profile,
    order: [...providerOrder],
    disabled,
    incompatibilities: providerIncompatibilities(
      profile.plugins.filter(plugin => loaded.has(plugin.name)),
      disabled,
    ),
  }
}

export function synchronizePluginOrder(installed: string[]): HarmonyProfile {
  return synchronizeProfile(activeProfileDir!, installed)
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

export function beginPluginUpdate(installed: string[], force = false): ProfileTransaction {
  const profile = synchronizeHarmonyProfile(activeProfileDir!, installed, false)
  const harmonyProviders = profile.plugins.filter(plugin => plugin.patches.length > 0)
  const nextDeclared = new Set(harmonyProviders.flatMap(provider => [
    join(provider.dir, 'package.json'),
    ...provider.patches.map(file => join(provider.dir, file)),
  ]))
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
  const previous = {
    providers: new Map(providers),
    declared: declaredProviderFiles,
    order: providerOrder,
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
    || previous.disabled.size !== profile.disabled.length
    || profile.disabled.some(key => !previous.disabled.has(key))
  if (!changed && !force) {
    return {
      generation,
      profile,
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
    disabledPatchKeys = new Set(profile.disabled)
    preflight(providerOrder, disabledPatchKeys)
  } catch (error) {
    for (const restore of [...stagedProviderCaches.values()].reverse()) restore()
    stagedProviderCaches.clear()
    replaceProviders(previous.providers)
    declaredProviderFiles = previous.declared
    providerOrder = previous.order
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
    profile,
    targets,
    commit() {
      if (!active) return
      pruneSemanticBindings(candidateGeneration)
      saveHarmonyState(activeProfileDir!, { order: profile.order, disabled: profile.disabled })
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

export function beginProfileUpdate(input: { order?: string[]; disabled?: string[] }): ProfileTransaction {
  const previous = {
    order: providerOrder,
    disabled: disabledPatchKeys,
    generation,
    cache: transformCache,
    statuses: patchStatuses,
    bindings: semanticBindings,
  }
  const order = pinHarmonyOrder(input.order ?? providerOrder)
  const disabled = new Set(input.disabled ?? disabledPatchKeys)
  preflight(order, disabled)

  providerOrder = order
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
    profile: { ...currentProfile(), order, disabled: [...disabled] },
    targets: allTargets(),
    commit() {
      if (!active) return
      pruneSemanticBindings(candidateGeneration)
      saveHarmonyState(activeProfileDir!, { order, disabled: [...disabled] })
      retainGeneration(candidateGeneration)
      pendingStatusGenerations.delete(candidateGeneration)
      active = false
    },
    rollback() {
      if (!active) return
      providerOrder = previous.order
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

function orderedPatches(input: RegisteredPatch[], order = providerOrder): RegisteredPatch[] {
  const rank = new Map(order.map((owner, index) => [owner, index]))
  return input.sort((a, b) => (rank.get(a.owner) ?? Number.MAX_SAFE_INTEGER)
    - (rank.get(b.owner) ?? Number.MAX_SAFE_INTEGER) || a.index - b.index)
}

function parse(filename: string, source: string): ts.SourceFile {
  return ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
}

function customizeSettings(filename: string, source: string): string {
  const sourceFile = parse(filename, source)
  const edit = new MagicString(source)
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
  return edit.toString().replace('width:800px;max-width:calc(100vw - 48px)', 'width:1040px;max-width:calc(100vw - 48px)')
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

function expectedMatches(registered: RegisteredPatch, matches: number, target: string): void {
  const expected = registered.patch.expect
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
  history: Array<{ owner: string; source: string }>,
): { source: string; matches: number } {
  const patch = registered.patch as HarmonySourcePatch
  const sourceFile = parse(filename, source)
  const nodes = tsquery(sourceFile, patch.select)
  try {
    expectedMatches(registered, nodes.length, target)
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
  patches: RegisteredPatch[],
): string {
  if (process.env.DSH_HARMONY_REACT_TRACE !== '1' || patches.length === 0) return source
  const sourceFile = parse(filename, source)
  const traced = new Map<string, { node: ts.CallExpression; runtime: string; traces: SourceTraceMetadata[] }>()
  for (const registered of patches) {
    const trace = (registered.patch as HarmonySourcePatch).trace
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

function semanticMatchCount(filename: string, source: string, functionName: string, registered: RegisteredPatch): number {
  const count = semanticFunctions(parse(filename, source), functionName).length
  expectedMatches(registered, count, `${registered.patch.target.package}/${relative(packageFor(filename)!.dir, filename)}`)
  return count
}

function assertNoReplaceConflict(functionName: string, registered: RegisteredPatch[]): void {
  const replacements = registered.filter(item => (item.patch as HarmonySemanticPatch).operation === 'replace')
  if (replacements.length > 1) {
    throw new Error(`dsh-harmony: replace conflict in ${functionName}: ${replacements.map(item => item.key).join(', ')}`)
  }
}

function instrumentSemantic(
  filename: string,
  source: string,
  functionName: string,
  registered: RegisteredPatch,
  bindingKey: string,
): { source: string; matches: number; bindingKey: string } {
  const sourceFile = parse(filename, source)
  const nodes = semanticFunctions(sourceFile, functionName)
  expectedMatches(registered, nodes.length, `${registered.patch.target.package}/${relative(packageFor(filename)!.dir, filename)}`)
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

function resolvedTargetFile(registered: RegisteredPatch, pkg: PackageInfo): string | undefined {
  return registered.patch.target.files.find(file => existsSync(join(pkg.dir, file)))
}

function versionError(registered: RegisteredPatch, pkg: PackageInfo): string | undefined {
  const range = registered.patch.target.version
  if (range === undefined || semver.satisfies(pkg.version, range, { includePrerelease: true })) return undefined
  return `target ${pkg.name}@${pkg.version} does not satisfy ${range}`
}

function buildTransform(
  filename: string,
  source: string,
  order = providerOrder,
  disabled = disabledPatchKeys,
  bind = true,
  records: Iterable<ProviderRecord> = providers.values(),
  transformGeneration = generation,
): TransformRecord {
  const pkg = packageFor(filename)!
  const relativeFile = relative(pkg.dir, filename).replaceAll('\\', '/')
  let output = pkg.name === '@deepseek-ai/dsh-client-ui-settings-general' && relativeFile === 'lib/client.js'
    ? customizeSettings(filename, source)
    : source
  const target = `${pkg.name}/${relativeFile}`
  const candidates = orderedPatches([...records].flatMap(provider => provider.patches), order)
    .filter(registered => registered.patch.target.package === pkg.name)
  const recordStatus = bind && transformGeneration === generation
  const applicable: RegisteredPatch[] = []
  for (const registered of candidates) {
    if (recordStatus) updateStatus(registered, { loaded: true, generation: transformGeneration })
    if (isPatchDisabled(registered, disabled)) {
      if (recordStatus) updateStatus(registered, { state: 'disabled', matches: 0, error: undefined, file: undefined, generation: transformGeneration })
      continue
    }
    const incompatible = versionError(registered, pkg)
    if (incompatible !== undefined) {
      if (recordStatus) updateStatus(registered, { state: 'failed', matches: 0, error: incompatible, generation: transformGeneration })
      continue
    }
    const file = resolvedTargetFile(registered, pkg)
    if (file === undefined) {
      if (recordStatus) updateStatus(registered, { state: 'failed', matches: 0, error: `none of the target files exist: ${registered.patch.target.files.join(', ')}`, generation: transformGeneration })
      continue
    }
    if (file === relativeFile) applicable.push(registered)
  }

  const steps: HarmonyPatchInspection['steps'] = []
  const history: Array<{ owner: string; source: string }> = []
  const traceable: RegisteredPatch[] = []
  const original = output
  const semantic = new Map<string, { bindingKey: string; patches: RegisteredPatch[] }>()
  for (const registered of applicable) {
    if (patchKind(registered.patch) === 'semantic') {
      if (relativeFile === 'lib/client.js') {
        const error = new Error(`dsh-harmony: semantic patch ${JSON.stringify(registered.key)} targets a browser bundle; use a source patch for lib/client.js`)
        if (recordStatus) updateStatus(registered, { state: 'failed', file: relativeFile, error: error.message, generation: transformGeneration })
        continue
      }
      const functionName = (registered.patch as HarmonySemanticPatch).target.function
      const current = semantic.get(functionName)
      try {
        let matches: number
        if (current === undefined) {
          const bindingKey = `${transformGeneration}\0${filename}\0${functionName}`
          const result = instrumentSemantic(filename, output, functionName, registered, bindingKey)
          output = result.source
          matches = result.matches
          semantic.set(functionName, { bindingKey, patches: [registered] })
          if (bind) semanticBindings.set(bindingKey, [registered])
        } else {
          matches = semanticMatchCount(filename, output, functionName, registered)
          assertNoReplaceConflict(functionName, [...current.patches, registered])
          current.patches.push(registered)
          if (bind) semanticBindings.set(current.bindingKey, [...current.patches])
        }
        history.push({ owner: registered.owner, source: output })
        steps.push({ key: registered.key, owner: registered.owner, matches, source: output })
        if (recordStatus) updateStatus(registered, { state: 'bound', matches, file: relativeFile, error: undefined, generation: transformGeneration })
      } catch (error) {
        if (recordStatus) updateStatus(registered, { state: 'failed', file: relativeFile, error: error instanceof Error ? error.message : String(error), generation: transformGeneration })
        continue
      }
      continue
    }
    try {
      const result = applySourcePatch(filename, target, output, original, registered, history)
      output = result.source
      history.push({ owner: registered.owner, source: output })
      steps.push({ key: registered.key, owner: registered.owner, matches: result.matches, source: output })
      if ((registered.patch as HarmonySourcePatch).trace !== undefined) traceable.push(registered)
      if (recordStatus) updateStatus(registered, { state: 'bound', matches: result.matches, file: relativeFile, error: undefined, generation: transformGeneration })
    } catch (error) {
      if (recordStatus) updateStatus(registered, {
        state: 'failed',
        matches: (error as { matches?: number }).matches ?? 0,
        file: relativeFile,
        error: error instanceof Error ? error.message : String(error),
        generation: transformGeneration,
      })
      continue
    }
  }

  const runtimeOutput = instrumentSourceTraces(filename, output, { package: pkg.name, file: relativeFile }, traceable)
  return {
    filename,
    generation: transformGeneration,
    packageVersion: pkg.version,
    source,
    output: runtimeOutput,
    inspection: { package: pkg.name, file: relativeFile, original: source, final: output, steps },
  }
}

function preflight(order: string[], disabled: Set<string>): void {
  for (const cached of transformCache.values()) {
    if (cached.generation === generation) buildTransform(cached.filename, cached.source, order, disabled, false)
  }
}

function isJavaScript(filename: string): boolean {
  return /\.[cm]?js$/.test(filename)
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
  if (!isJavaScript(filename)) return source
  filename = realpathSync(filename)
  if (loadedPatchFiles.has(filename) || loadingPatchFiles.has(filename)) return source
  packageCache.clear()
  const pkg = packageFor(filename)
  if (pkg === undefined) return source
  const state = generationStates.get(requestedGeneration)
  if (state === undefined) return source
  const cacheKey = `${requestedGeneration}\0${filename}`
  const cached = transformCache.get(cacheKey)
  if (cached?.packageVersion === pkg.version && cached.source === source) return cached.output
  const result = buildTransform(
    filename,
    source,
    state.order,
    state.disabled,
    true,
    state.providers,
    requestedGeneration,
  )
  transformCache.set(cacheKey, result)
  return result.output
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function'
}

function invokeSemantic(bindingKey: string, self: unknown, initialArgs: unknown[], original: (args: unknown[]) => unknown): unknown {
  const patches = semanticBindings.get(bindingKey) ?? []
  const before = patches.filter(item => (item.patch as HarmonySemanticPatch).operation === 'before')
  const decorators = patches.filter(item => {
    const operation = (item.patch as HarmonySemanticPatch).operation
    return operation === 'around' || operation === 'replace'
  })
  const after = patches.filter(item => (item.patch as HarmonySemanticPatch).operation === 'after')

  const runBefore = (index: number, args: unknown[]): unknown[] | PromiseLike<unknown> => {
    if (index === before.length) return args
    const patch = before[index]!.patch as HarmonySemanticPatch
    const changed = patch.handler({ args, self, invoke: next => runBefore(index + 1, next ?? args) })
    const proceed = (value: unknown): unknown[] | PromiseLike<unknown> => runBefore(index + 1, Array.isArray(value) ? value : args)
    return isPromiseLike(changed) ? changed.then(proceed) : proceed(changed)
  }

  const runDecorators = (index: number, args: unknown[]): unknown => {
    if (index === decorators.length) return original(args)
    const patch = decorators[index]!.patch as HarmonySemanticPatch
    return patch.handler({ args, self, invoke: next => runDecorators(index + 1, next ?? args) })
  }

  const runAfter = (index: number, result: unknown): unknown => {
    if (index === after.length) return result
    const patch = after[index]!.patch as HarmonySemanticPatch
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
        if (item !== undefined && patchKind(item.patch) === 'source') {
          try {
            applySourcePatch(record.filename, target, base, base, item, [])
          } catch (error) {
            const candidates = [...new Set(previousOwners.filter(candidate => candidate !== owner))]
            if (candidates.length > 0) dependencies.push({
              patch: item.key,
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
  inspectTargets(providerOrder, disabledPatchKeys, continueOnError, true)
  return getPatchInspections()
}

function inspectTargets(order: string[], disabled: Set<string>, continueOnError: boolean, bind: boolean): void {
  const profileManifest = pathToFileURL(join(activeProfileDir!, 'package.json'))
  const allPatches = [...providers.values()].flatMap(provider => provider.patches)
  const targetPackages = new Set(allPatches.map(item => item.patch.target.package))
  for (const packageName of targetPackages) {
    let manifest: string | undefined
    try {
      manifest = findPackageJSON(packageName, profileManifest)
    } catch {}
    if (manifest === undefined) {
      const error = new Error(`dsh-harmony: target package ${JSON.stringify(packageName)} is not installed`)
      if (bind) {
        for (const item of allPatches.filter(patch => patch.patch.target.package === packageName)) {
          updateStatus(item, { state: 'failed', loaded: false, matches: 0, error: error.message, file: undefined, generation })
        }
      }
      continue
    }
    const pkg = readPackageInfo(dirname(manifest))
    packageCache.set(pkg.dir, pkg)
    const registered = allPatches.filter(item => item.patch.target.package === packageName)
    const files = new Set(registered.map(item => resolvedTargetFile(item, pkg)).filter(file => file !== undefined))
    if (bind) {
      for (const item of registered) {
        if (resolvedTargetFile(item, pkg) !== undefined) continue
        const incompatible = versionError(item, pkg)
        updateStatus(item, isPatchDisabled(item, disabled)
          ? { state: 'disabled', loaded: true, matches: 0, error: undefined, file: undefined, generation }
          : {
              state: 'failed', loaded: true, matches: 0, file: undefined, generation,
              error: incompatible ?? `none of the target files exist: ${item.patch.target.files.join(', ')}`,
            })
      }
    }
    for (const file of files) {
      const filename = join(pkg.dir, file)
      const source = nativeReadFileSync(filename, 'utf8')
      try {
        const result = buildTransform(filename, source, order, disabled, bind)
        if (bind) transformCache.set(`${generation}\0${filename}`, result)
      } catch (error) {
        if (!continueOnError) throw error
      }
    }
  }
}

export function preflightProfileUpdate(input: { order?: string[]; disabled?: string[] }): void {
  inspectTargets(
    pinHarmonyOrder(input.order ?? providerOrder),
    new Set(input.disabled ?? disabledPatchKeys),
    false,
    false,
  )
}

function filenameOf(path: unknown): string | undefined {
  if (typeof path === 'string') return path.startsWith('file:') ? fileURLToPath(path) : path
  return path instanceof URL && path.protocol === 'file:' ? fileURLToPath(path) : undefined
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
    const output = transform(filename, value.toString())
    return Buffer.isBuffer(value) ? Buffer.from(output) : output
  }) as typeof fs.readFileSync
  fs.promises.readFile = (async (path: Parameters<typeof fs.promises.readFile>[0], ...args: unknown[]) => {
    const value = await nativeReadFile(path, ...args as [])
    const filename = filenameOf(path)
    if (filename === undefined || !isJavaScript(filename) || (!Buffer.isBuffer(value) && typeof value !== 'string')) return value
    if (typeof value === 'string' && !isUtf8Read(args[0])) return value
    const output = transform(filename, value.toString())
    return Buffer.isBuffer(value) ? Buffer.from(output) : output
  }) as typeof fs.promises.readFile
  syncBuiltinESMExports()
}

export function installModuleHooks(): void {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'dsh-harmony') return { url: indexUrl, shortCircuit: true }
      if (specifier === 'dsh-harmony:plugin') return { url: pluginUrl, shortCircuit: true }
      if (specifier === 'dsh-harmony/package.json') return { url: manifestUrl, shortCircuit: true }
      const marker = '?dsh-harmony='
      const index = specifier.lastIndexOf(marker)
      const result = nextResolve(index === -1 ? specifier : specifier.slice(0, index), context)
      let nextGeneration = index === -1 ? undefined : specifier.slice(index + marker.length)
      if (nextGeneration === undefined && context.parentURL?.startsWith('file:') && result.url.startsWith('file:')) {
        const parentUrl = new URL(context.parentURL)
        const inherited = parentUrl.searchParams.get('dsh-harmony') ?? undefined
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
      const result = nextLoad(url, context)
      if (url.startsWith('file:') && (result.format === 'module' || result.format === 'commonjs') && result.source != null) {
        const requested = Number(new URL(url).searchParams.get('dsh-harmony') ?? generation)
        result.source = transform(fileURLToPath(url), result.source.toString(), requested)
      }
      return result
    },
  })
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
