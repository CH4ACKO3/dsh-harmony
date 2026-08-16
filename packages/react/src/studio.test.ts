import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  STUDIO_RUNTIME_KEY,
  registerStudioElement,
  registerStudioVariables,
  type StudioBrowserRuntime,
} from './studio.js'

const target = globalThis as typeof globalThis & { [STUDIO_RUNTIME_KEY]?: StudioBrowserRuntime }

afterEach(() => {
  delete target[STUDIO_RUNTIME_KEY]
})

describe('Studio browser registration', () => {
  it('does nothing outside a Studio Preview', () => {
    expect(() => registerStudioElement({
      owner: 'draft',
      element: { id: 'toolbar', label: 'Toolbar', boundary: { surfaceId: 'draft', path: ['draft', 'toolbar'] }, source: { file: 'src/Toolbar.tsx' } },
      bindings: {},
    })()).not.toThrow()
  })

  it('delegates element and global variable registrations to the Preview runtime', () => {
    const disposeElement = vi.fn()
    const disposeVariables = vi.fn()
    const runtime = {
      registerElement: vi.fn(() => disposeElement),
      registerVariables: vi.fn(() => disposeVariables),
    }
    target[STUDIO_RUNTIME_KEY] = runtime
    const element = { owner: 'draft', element: {
      id: 'toolbar', label: 'Toolbar', boundary: { surfaceId: 'draft', path: ['draft', 'toolbar'] }, source: { file: 'src/Toolbar.tsx' },
    }, bindings: {} }
    const variables = { owner: 'draft', variables: [], bindings: {} }

    registerStudioElement(element)()
    registerStudioVariables(variables)()

    expect(runtime.registerElement).toHaveBeenCalledWith(element)
    expect(runtime.registerVariables).toHaveBeenCalledWith(variables)
    expect(disposeElement).toHaveBeenCalledOnce()
    expect(disposeVariables).toHaveBeenCalledOnce()
  })
})
