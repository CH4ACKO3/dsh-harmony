export interface ClientPatchTarget {
  package: string
  version: string
}

export type ElementSelector =
  | { component: string }
  | { intrinsic: string }
  | { tsquery: string }

export interface ClientExport {
  module: string
  export: string
}

interface ElementPatchOptions {
  id: string
  target: ClientPatchTarget
  select: ElementSelector
  expect: number
}

export interface ReplaceElementOptions extends ElementPatchOptions {
  with: ClientExport
}

export interface WrapElementOptions extends ElementPatchOptions {
  with: ClientExport
}

export interface InsertElementOptions extends ElementPatchOptions {
  insert: ClientExport
}

export type RemoveElementOptions = ElementPatchOptions

export interface TransformPropsOptions extends ElementPatchOptions {
  transform: ClientExport
}

export interface ReplaceStringLiteralOptions {
  id: string
  target: ClientPatchTarget
  text: string
  with: string
  expect: number
}
