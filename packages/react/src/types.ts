import type { HarmonyPatchOrder, HarmonyPatchTarget } from 'dsh-harmony'

export interface ReactPatchTarget extends HarmonyPatchTarget {
  version: string
}

export type ElementSelector =
  | { component: string }
  | { intrinsic: string }
  | { tsquery: string }

export type ComponentSelector =
  /** Selects an initialized variable or named function declaration and enables component call-path tracing. */
  | { name: string }
  /** Selects the declaration exactly; raw selectors cannot infer component call sites for tracing. */
  | { tsquery: string }

export interface ClientReference {
  module: string
  export: string
}

export type ElementOperation =
  | { kind: 'replace'; with: ClientReference }
  | { kind: 'wrap'; with: ClientReference }
  | { kind: 'insert-before'; with: ClientReference }
  | { kind: 'insert-after'; with: ClientReference }
  | { kind: 'transform-props'; with: ClientReference }
  | { kind: 'remove' }

export interface ElementPatchOptions extends HarmonyPatchOrder {
  id: string
  target: ReactPatchTarget
  select: ElementSelector
  expect: number
  operation: ElementOperation
}

export type ComponentOperation =
  | { kind: 'decorate'; with: ClientReference }
  | { kind: 'replace'; with: ClientReference }

export interface ComponentPatchOptions extends HarmonyPatchOrder {
  id: string
  target: ReactPatchTarget
  select: ComponentSelector
  expect: number
  operation: ComponentOperation
}
