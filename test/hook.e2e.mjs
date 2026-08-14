import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { reloadEntries } from '../lib/plugin.js'
import { beginProfileUpdate, getPatchStatuses, installModuleHooks, synchronizeProfile } from '../lib/runtime.js'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-hook-'))
const modules = join(profile, 'node_modules')
mkdirSync(modules)
for (const name of ['provider', 'provider-cjs', 'target', 'target-cjs']) {
  const packageName = { provider: 'hook-provider', 'provider-cjs': 'hook-provider-cjs', target: 'hook-target', 'target-cjs': 'hook-target-cjs' }[name]
  cpSync(join(fixtures, name), join(modules, packageName), { recursive: true })
}
writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: {
  'hook-provider': '1', 'hook-provider-cjs': '1', 'hook-target': '1', 'hook-target-cjs': '1',
} }))
installModuleHooks()

const targetEntry = pathToFileURL(join(modules, 'hook-target/lib/index.js')).href
const cjsEntry = join(modules, 'hook-target-cjs/lib/index.cjs')
const original = await import(`${targetEntry}?dsh-harmony=0`)
assert.equal(original.answer(), 1)
const originalCjs = await import(`${pathToFileURL(cjsEntry).href}?dsh-harmony=0`)
assert.equal(originalCjs.default.answer(), 1)

synchronizeProfile(profile)
const generation = getPatchStatuses().find(patch => patch.owner === 'hook-provider').generation
const target = await import(`${targetEntry}?dsh-harmony=${generation}`)
assert.equal(target.answer(), 2)
const candidate = beginProfileUpdate({ disabled: ['hook-provider/lazy-patch'] })
assert.equal(await target.lazyAnswer(), 2)
candidate.rollback()
assert.equal(await target.lazyAnswer(), 2)
const entry = {
  options: { name: cjsEntry },
  fiber: { uid: 1, runtime: { callback: originalCjs.default } },
  loader: { unwrapExports(value) {
    value = value?.default ?? value
    return value?.__esModule ? value.default ?? value : value
  } },
  parent: { tree: { ctx: { baseUrl: import.meta.url }, import() { return import(`${pathToFileURL(cjsEntry).href}?dsh-harmony=${generation}`) } } },
  getOuterStack() { return [] },
  async _dispose() { this.fiber = undefined },
  async _start(plugin) { this.fiber = { uid: 2, runtime: { callback: plugin } } },
}
await reloadEntries([entry], 1)
assert.equal(entry.fiber.runtime.callback.answer(), 2)
rmSync(profile, { recursive: true })
