import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const harmony = fileURLToPath(new URL('../lib/bin.js', import.meta.url))
const packageRoot = fileURLToPath(new URL('..', import.meta.url))
assert.equal(require.resolve('dsh-harmony/bin'), harmony)

const root = mkdtempSync(join(tmpdir(), 'dsh harmony embedded-'))
const nodeModules = join(root, 'node_modules')
const embeddedHarmony = join(nodeModules, 'dsh-harmony')
const officialPackage = join(nodeModules, '@deepseek-ai/dsh')
const appBoot = join(nodeModules, '@deepseek-ai/dsh-app-boot')
const configuredModules = join(root, 'desktop-host/node_modules')
const configuredOfficialPackage = join(configuredModules, '@deepseek-ai/dsh')
const configuredAppBoot = join(configuredModules, '@deepseek-ai/dsh-app-boot')
const home = join(root, 'home')
mkdirSync(embeddedHarmony, { recursive: true })
mkdirSync(join(officialPackage, 'lib'), { recursive: true })
mkdirSync(appBoot, { recursive: true })
cpSync(join(packageRoot, 'lib'), join(embeddedHarmony, 'lib'), { recursive: true })
writeFileSync(join(embeddedHarmony, 'package.json'), JSON.stringify({ name: 'dsh-harmony', type: 'module' }))
for (const dependency of ['@phenomnomnominal/tsquery', 'magic-string', 'semver', 'typescript']) {
  const target = join(nodeModules, dependency)
  mkdirSync(dirname(target), { recursive: true })
  symlinkSync(join(packageRoot, 'node_modules', dependency), target, process.platform === 'win32' ? 'junction' : 'dir')
}
writeFileSync(join(officialPackage, 'package.json'), JSON.stringify({
  name: '@deepseek-ai/dsh',
  type: 'module',
  exports: { './lib/bin.js': './lib/bin.js' },
}))
writeFileSync(join(officialPackage, 'lib/bin.js'), `
process.stdout.write(JSON.stringify({ entry: 'official', active: process.env.DSH_HARMONY_ACTIVE }))
`)
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
cpSync(officialPackage, configuredOfficialPackage, { recursive: true })
cpSync(appBoot, configuredAppBoot, { recursive: true })
const configuredEntry = join(configuredOfficialPackage, 'lib/bin.js')
writeFileSync(configuredEntry, `
process.stdout.write(JSON.stringify({ entry: 'configured', active: process.env.DSH_HARMONY_ACTIVE }))
`)

try {
  const delegated = spawnSync(process.execPath, [
    join(embeddedHarmony, 'lib/bin.js'),
    '--version',
  ], {
    encoding: 'utf8',
    env: { ...process.env, DSH_HOME: home },
  })
  assert.equal(delegated.status, 0, delegated.stderr)
  assert.deepEqual(JSON.parse(delegated.stdout), { entry: 'official', active: '1' })
  assert.equal(existsSync(home), false)

  const configured = spawnSync(process.execPath, [
    join(embeddedHarmony, 'lib/bin.js'),
    '--version',
  ], {
    encoding: 'utf8',
    env: { ...process.env, DSH_HOME: home, DSH_HARMONY_DSH_ENTRY: configuredEntry },
  })
  assert.equal(configured.status, 0, configured.stderr)
  assert.deepEqual(JSON.parse(configured.stdout), { entry: 'configured', active: '1' })
} finally {
  rmSync(root, { recursive: true })
}
