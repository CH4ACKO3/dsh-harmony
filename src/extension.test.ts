import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { expect, test } from 'vitest'
import { discoverHarmonyExtensions, loadHarmonyExtensions } from './extension.js'

function profileWithExtension(source: string): { profile: string; extensionDir: string } {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-extension-'))
  const extensionDir = join(profile, 'node_modules', 'example-extension')
  mkdirSync(extensionDir, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'example-extension': '1.0.0' },
  }))
  writeFileSync(join(extensionDir, 'package.json'), JSON.stringify({
    name: 'example-extension',
    type: 'module',
    dsh: { harmony: { extension: './extension.js' } },
  }))
  writeFileSync(join(extensionDir, 'extension.js'), source)
  return { profile, extensionDir }
}

test('discovers and owns plain profile Harmony extensions', async () => {
  const { profile, extensionDir } = profileWithExtension(`
export function apply(ctx) {
  ctx.provide('exampleExtension', { active: true })
}
`)
  const ctx = new Context()
  try {
    expect(discoverHarmonyExtensions(profile)).toEqual([{
      name: 'example-extension',
      dir: realpathSync(extensionDir),
      entry: realpathSync(join(extensionDir, 'extension.js')),
    }])

    const dispose = await loadHarmonyExtensions(ctx, profile)
    expect(ctx.get('exampleExtension')).toEqual({ active: true })
    await dispose()
    expect(ctx.get('exampleExtension')).toBeUndefined()
  } finally {
    rmSync(profile, { recursive: true })
  }
})

test('rejects an extension entry outside its package', () => {
  const { profile, extensionDir } = profileWithExtension('export function apply() {}')
  const outside = join(profile, 'outside.js')
  writeFileSync(outside, 'export function apply() {}')
  writeFileSync(join(extensionDir, 'package.json'), JSON.stringify({
    name: 'example-extension',
    dsh: { harmony: { extension: '../../outside.js' } },
  }))
  try {
    expect(() => discoverHarmonyExtensions(profile)).toThrow('escapes its package directory')
  } finally {
    rmSync(profile, { recursive: true })
  }
})
