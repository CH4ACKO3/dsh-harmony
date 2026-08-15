import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const harmony = fileURLToPath(new URL('../lib/bin.js', import.meta.url))
assert.equal(require.resolve('dsh-harmony/bin'), harmony)

const root = mkdtempSync(join(tmpdir(), 'dsh harmony embedded-'))
const appBoot = join(root, 'node_modules/@deepseek-ai/dsh-app-boot')
const desktop = join(root, 'desktop/lib/bin.js')
const explicit = join(root, 'explicit/lib/bin.js')
const home = join(root, 'home')
mkdirSync(appBoot, { recursive: true })
mkdirSync(dirname(desktop), { recursive: true })
mkdirSync(dirname(explicit), { recursive: true })
writeFileSync(join(appBoot, 'package.json'), JSON.stringify({
  name: '@deepseek-ai/dsh-app-boot',
  type: 'module',
  exports: './index.js',
}))
writeFileSync(join(appBoot, 'index.js'), `
export const PROFILE_TEMPLATES = {}
export function initProfile() {}
export function resolveProfileDir() { throw new Error('profile resolution is not expected') }
`)
const entry = name => `process.stdout.write(JSON.stringify({ entry: ${JSON.stringify(name)}, active: process.env.DSH_HARMONY_ACTIVE }))\n`
writeFileSync(desktop, entry('desktop'))
writeFileSync(explicit, entry('explicit'))

const run = overrides => {
  const env = { ...process.env, ...overrides }
  delete env.DSH_HARMONY_COMMAND
  return spawnSync(process.execPath, [harmony, '--version'], { encoding: 'utf8', env })
}

try {
  const delegated = run({
    DSH_HOME: home,
    DSH_DESKTOP_BUILTIN_HOST_ENTRY: desktop,
    DSH_HARMONY_OFFICIAL: undefined,
  })
  assert.equal(delegated.status, 0, delegated.stderr)
  assert.deepEqual(JSON.parse(delegated.stdout), { entry: 'desktop', active: '1' })

  const overridden = run({
    DSH_HOME: home,
    DSH_DESKTOP_BUILTIN_HOST_ENTRY: desktop,
    DSH_HARMONY_OFFICIAL: explicit,
  })
  assert.equal(overridden.status, 0, overridden.stderr)
  assert.deepEqual(JSON.parse(overridden.stdout), { entry: 'explicit', active: '1' })
  assert.equal(existsSync(home), false)
} finally {
  rmSync(root, { recursive: true })
}
