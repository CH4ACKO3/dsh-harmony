import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { RegisterHooksOptions } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, expect, test, vi } from 'vitest'

const registered = vi.hoisted(() => [] as RegisterHooksOptions[])
vi.mock('node:module', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:module')>()
  return {
    ...original,
    registerHooks(options: RegisterHooksOptions) {
      registered.push(options)
      return { deregister() {} }
    },
  }
})

const { installModuleHooks } = await import('./runtime.js')
const root = mkdtempSync(join(tmpdir(), 'dsh-harmony-module-source-'))
const filename = join(root, 'index.js')
writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'module-source-target', type: 'module' }))
writeFileSync(filename, 'export const value = 1\n')

afterAll(() => rmSync(root, { recursive: true }))

test('installs one module hook chain and decodes every ModuleSource representation as UTF-8', () => {
  installModuleHooks()
  installModuleHooks()
  expect(registered).toHaveLength(1)

  const load = registered[0]!.load!
  const source = Buffer.from('export const value = 1\n')
  const context = { conditions: [], format: 'module', importAttributes: {} }
  const arrayBuffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength)
  const fromArrayBuffer = load(pathToFileURL(filename).href, context, () => ({
    format: 'module', source: arrayBuffer,
  }))
  const fromTypedArray = load(pathToFileURL(filename).href, context, () => ({
    format: 'module', source: Uint8Array.from(source),
  }))

  expect(fromArrayBuffer.source).toBe(source.toString('utf8'))
  expect(fromTypedArray.source).toBe(source.toString('utf8'))
})
