import type MagicString from 'magic-string'
import type ts from 'typescript'
import type { DraftHandle, DraftPackage } from './draft-runtime.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    harmony: HarmonyService
  }
}

export interface HarmonyService {
  readonly binEntry: string
  readonly profileDir: string
  inspect(input?: HarmonyInspectInput): HarmonyInspection
  inspectDependencies(owner: string): HarmonyPatchDependency[]
  prepareDraft(input: DraftPackage): Promise<DraftHandle>
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

export interface HarmonySourcePatch {
  id: string
  target: HarmonyPatchTarget
  select: string
  expect?: number
  trace?: HarmonySourceTrace
  apply(context: HarmonyPatchContext): void
}

export interface HarmonySourceTrace {
  select: string
  effect: 'replace-element' | 'wrap-element' | 'insert-before' | 'insert-after' | 'transform-props'
  maxMatches: number
}

export type HarmonySemanticOperation = 'before' | 'after' | 'around' | 'replace'

export interface HarmonySemanticContext {
  args: unknown[]
  self: unknown
  result?: unknown
  invoke(args?: unknown[]): unknown
}

export interface HarmonySemanticPatch {
  id: string
  target: HarmonyPatchTarget & { function: string }
  operation: HarmonySemanticOperation
  expect?: number
  handler(context: HarmonySemanticContext): unknown
}

export type HarmonyPatch = HarmonySourcePatch | HarmonySemanticPatch

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
  target: HarmonyPatchTarget
  kind: 'source' | 'semantic'
  operation?: HarmonySemanticOperation
  state: 'pending' | 'bound' | 'disabled' | 'failed'
  loaded: boolean
  matches: number
  generation: number
  declaration: string
  file?: string
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
export { HarmonyDraftRuntime } from './draft-runtime.js'
export type { ClientGraph, DraftHandle, DraftPackage, DraftRuntimeAdapter, DraftState } from './draft-runtime.js'
export { discoverHarmonyExtensions, loadHarmonyExtensions } from './extension.js'
export type { HarmonyExtension } from './extension.js'
