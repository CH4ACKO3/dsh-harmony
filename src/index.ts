import type MagicString from 'magic-string'
import type ts from 'typescript'
import type { HarmonyReloadStatus } from './installer.js'
import type { HarmonyProfileUpdate, HarmonyProfileView } from './profile.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    harmony: HarmonyService
  }
}

export interface HarmonyService {
  readonly binEntry: string
  readonly profileDir: string
  profile(): HarmonyProfileView
  updateProfile(input: HarmonyProfileUpdate): Promise<HarmonyProfileUpdateResult>
  inspect(input?: HarmonyInspectInput): HarmonyInspection
  inspectDependencies(owner: string): HarmonyPatchDependency[]
  reloadPlugin(name: string): Promise<void>
}

export interface HarmonyProfileUpdateResult {
  profile: HarmonyProfileView
  generation: number
  reload: HarmonyReloadStatus
  clientGraphRev?: string
}

export interface HarmonyInspectInput {
  package?: string
  file?: string
}

export interface HarmonyInspection {
  patches: HarmonyPatchStatus[]
  targets: HarmonyPatchInspection[]
}

export interface HarmonyPatchDependency {
  patch: string
  target: { package: string; file: string }
  providerCandidates: string[]
  reason: string
}

export interface HarmonyPatchTarget {
  package: string
  files: string[]
  version?: string
}

export interface HarmonyPatchOrder {
  /** Apply this Patch before every Patch owned by the named providers. Defining either field replaces the provider-wide rule. */
  before?: string[]
  /** Apply this Patch after every Patch owned by the named providers. Defining either field replaces the provider-wide rule. */
  after?: string[]
}

export interface HarmonySourcePatch extends HarmonyPatchOrder {
  id: string
  target: HarmonyPatchTarget
  select: string
  expect?: number
  trace?: HarmonySourceTrace
  apply(context: HarmonyPatchContext): void
}

export interface HarmonyLoaderPatch extends HarmonyPatchOrder {
  id: string
  target: HarmonyPatchTarget
  loader: 'typescript'
}

export interface HarmonySourceTrace {
  select: string
  effect:
    | 'replace-element'
    | 'wrap-element'
    | 'insert-before'
    | 'insert-after'
    | 'transform-props'
    | 'decorate-component'
    | 'replace-component'
  maxMatches: number
}

export type HarmonySemanticOperation = 'before' | 'after' | 'around' | 'replace'

export interface HarmonySemanticContext {
  args: unknown[]
  self: unknown
  result?: unknown
  invoke(args?: unknown[]): unknown
}

export interface HarmonySemanticPatch extends HarmonyPatchOrder {
  id: string
  target: HarmonyPatchTarget & { function: string }
  operation: HarmonySemanticOperation
  expect?: number
  handler(context: HarmonySemanticContext): unknown
}

export type HarmonyPatch = HarmonySourcePatch | HarmonySemanticPatch | HarmonyLoaderPatch

/**
 * A single ordered and toggleable Patch made from several ordinary Patches.
 * Members keep declaration order and commit atomically across their resolved targets.
 */
export interface HarmonyCompositePatch extends HarmonyPatchOrder {
  id: string
  patches: HarmonyPatch[]
}

export type HarmonyPatchDeclaration = HarmonyPatch | HarmonyCompositePatch

export interface HarmonyPatchContext {
  patch: { key: string; owner: string }
  source: string
  sourceFile: ts.SourceFile
  node: ts.Node
  edit: MagicString
  ts: typeof ts
}

export interface HarmonyPatchStatus {
  key: string
  id: string
  owner: string
  index: number
  targets: HarmonyPatchTarget[]
  kind: 'source' | 'semantic' | 'loader' | 'composite'
  operation?: HarmonySemanticOperation
  loader?: HarmonyLoaderPatch['loader']
  state: 'pending' | 'bound' | 'disabled' | 'failed'
  status: 'normal' | 'warning' | 'error' | 'disabled'
  loaded: boolean
  matches: number
  generation: number
  declaration: string
  members?: Array<{
    id: string
    target: HarmonyPatchTarget
    kind: 'source' | 'semantic' | 'loader'
    operation?: HarmonySemanticOperation
    loader?: HarmonyLoaderPatch['loader']
  }>
  file?: string
  files?: string[]
  error?: string
}

export interface HarmonyPatchInspection {
  package: string
  file: string
  original: string
  final: string
  steps: Array<{
    key: string
    owner: string
    matches: number
    source: string
  }>
}

export { apply, inject } from './plugin.js'
export { discoverHarmonyExtensions, loadHarmonyExtensions } from './extension.js'
export type { HarmonyExtension } from './extension.js'
export {
  preflightHarmonyProfileUpdate,
  readHarmonyProfile,
} from './profile.js'
export { updateHarmonyProfile } from './control.js'
export type {
  HarmonyProfilePluginView,
  HarmonyProfileUpdate,
  HarmonyProfileView,
} from './profile.js'
export type {
  HarmonyPluginConflict,
  HarmonyPluginConflictDeclarations,
  HarmonyPluginRef,
} from './conflicts.js'
export type { HarmonyReloadStatus } from './installer.js'
export type { HarmonyOrderViolation, HarmonyPatchOrderItem } from './order.js'
