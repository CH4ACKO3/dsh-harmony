import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, test } from 'vitest'

describe('rebrand provider example', () => {
  test('exports both a Loader plugin and the replacement component', () => {
    let definition: { factory(require: (id: string) => unknown): Record<string, unknown> } | undefined
    runInNewContext(
      readFileSync(new URL('../examples/rebrand-plugin/client.js', import.meta.url), 'utf8'),
      {
        window: {
          __ModuleLoader__: {
            load(candidate: typeof definition) {
              definition = candidate
            },
          },
        },
      },
    )

    const exports = definition?.factory((id) => {
      expect(id).toBe('react')
      return { createElement: () => null }
    })
    expect(exports).toMatchObject({
      apply: expect.any(Function),
      CustomBrand: expect.any(Function),
    })
  })

  test('declares the client-module export used by DSH discovery', () => {
    const manifest = JSON.parse(readFileSync(
      new URL('../examples/rebrand-plugin/package.json', import.meta.url),
      'utf8',
    )) as { exports?: Record<string, string> }
    expect(manifest.exports?.['./client']).toBe('./client.js')
  })
})
