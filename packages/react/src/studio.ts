import { STUDIO_RUNTIME_KEY, type StudioBrowserRuntime } from './studio-host.js'

export type StudioVariableValue = string | number | boolean

export interface StudioVariableDefinition {
  kind: 'variable'
  id: string
  label: string
  control: 'color' | 'length' | 'number' | 'boolean' | 'enum' | 'string'
  options?: readonly string[]
  constraints?: { min?: number; max?: number; step?: number }
  /** Stable source anchors for this control's default initializer. */
  defaultSource?: {
    file: string
    before: string
    after: string
  }
}

export interface StudioVariableGroupDefinition {
  kind: 'group'
  id: string
  label: string
  children: readonly StudioVariableNode[]
}

export type StudioVariableNode = StudioVariableDefinition | StudioVariableGroupDefinition

export interface StudioElementDefinition {
  id: string
  label: string
  boundary: { surfaceId: string; path: readonly string[] }
  source: { file: string; line?: number; column?: number }
  variables?: readonly StudioVariableNode[]
}

export interface StudioVariableBinding {
  get(): StudioVariableValue
  set(value: StudioVariableValue): void | Promise<void>
  subscribe?(listener: () => void): () => void
}

export interface StudioElementRegistration {
  owner: string
  element: StudioElementDefinition
  bindings: Readonly<Record<string, StudioVariableBinding>>
}

export interface StudioVariablesRegistration {
  owner: string
  variables: readonly StudioVariableNode[]
  bindings: Readonly<Record<string, StudioVariableBinding>>
}

type StudioGlobal = typeof globalThis & {
  [STUDIO_RUNTIME_KEY]?: StudioBrowserRuntime
}

export function registerStudioElement(registration: StudioElementRegistration): () => void {
  return (globalThis as StudioGlobal)[STUDIO_RUNTIME_KEY]?.registerElement(registration) ?? (() => {})
}

export function registerStudioVariables(registration: StudioVariablesRegistration): () => void {
  return (globalThis as StudioGlobal)[STUDIO_RUNTIME_KEY]?.registerVariables(registration) ?? (() => {})
}
