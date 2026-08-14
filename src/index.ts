import type MagicString from 'magic-string'
import type ts from 'typescript'

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
  apply(context: HarmonyPatchContext): void
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
