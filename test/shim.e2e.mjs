import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const { installShim, resolveCommandPath } = require('../scripts/install-shim.cjs')
const root = mkdtempSync(join(tmpdir(), 'dsh-harmony-shim-'))
const prefix = join(root, 'prefix')
const globalModules = process.platform === 'win32'
  ? join(prefix, 'node_modules')
  : join(prefix, 'lib/node_modules')
const harmony = join(globalModules, 'dsh-harmony')
const official = join(globalModules, '@deepseek-ai/dsh/lib/bin.js')
const command = resolveCommandPath(prefix)
const home = join(root, 'home')
const originalPatch = '- insert:\n    - id: ordinary\n      name: ordinary-plugin\n'

assert.equal(resolveCommandPath('/global', 'linux'), join('/global', 'bin/dsh'))
assert.equal(resolveCommandPath('/global', 'darwin'), join('/global', 'bin/dsh'))
assert.equal(resolveCommandPath('/global', 'win32'), join('/global', 'dsh'))

mkdirSync(dirname(official), { recursive: true })
mkdirSync(join(harmony, 'lib'), { recursive: true })
mkdirSync(dirname(command), { recursive: true })
mkdirSync(home, { recursive: true })
writeFileSync(join(home, 'cordis.patch.yml'), originalPatch)
writeFileSync(official, '#!/usr/bin/env node\nconsole.log("official")\n')
writeFileSync(join(harmony, 'lib/bin.js'), '#!/usr/bin/env node\nconsole.log("harmony")\n')
chmodSync(official, 0o755)
copyFileSync(official, command)
cpSync('scripts', join(harmony, 'scripts'), { recursive: true })
cpSync('node_modules/yaml', join(harmony, 'node_modules/yaml'), { recursive: true })
cpSync('node_modules/js-yaml', join(globalModules, 'js-yaml'), { recursive: true })

const install = spawnSync(process.execPath, [join(harmony, 'scripts/postinstall.cjs')], {
  encoding: 'utf8',
  env: {
    ...process.env,
    DSH_HOME: home,
    NODE_PATH: join(process.cwd(), 'node_modules'),
    npm_config_global: 'true',
    npm_config_prefix: prefix,
  },
})
assert.equal(install.status, 0, install.stderr)
assert.match(readFileSync(join(home, 'cordis.patch.yml'), 'utf8'), /id: ordinary[\s\S]*id: harmony-bootstrap/)
assert.equal(existsSync(join(home, 'node_modules/dsh-harmony-bootstrap/client.js')), true)
if (process.platform === 'win32') {
  assert.equal(existsSync(`${command}.cmd`), true)
  assert.equal(existsSync(`${command}.ps1`), true)
}

function runCommand() {
  if (process.platform === 'win32') {
    return spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `"${command}.cmd"`], { encoding: 'utf8' })
  }
  return spawnSync(command, { encoding: 'utf8' })
}

const withHarmony = runCommand()
assert.equal(withHarmony.status, 0, withHarmony.stderr)
assert.equal(withHarmony.stdout.trim(), 'harmony')

copyFileSync(official, command)
if (process.platform === 'win32') {
  writeFileSync(`${command}.cmd`, '@node "%~dp0dsh" %*\n')
  writeFileSync(`${command}.ps1`, '& node "$PSScriptRoot/dsh" @args\n')
}
let warning = ''
const routes = []
const bootstrapFile = join(home, 'node_modules/dsh-harmony-bootstrap/bootstrap.cjs')
const bootstrap = require(bootstrapFile)
bootstrap.apply({
  appExit() {},
  inject(_services, callback) {
    callback({ webServer: { register(route) { routes.push(route); return () => {} } } })
  },
  logger: { warn(message) { warning = message } },
})
assert.match(warning, /Restart dsh/)
assert.equal(routes.some(route => route.path === '/dsh-harmony-bootstrap/restart'), true)
const repaired = runCommand()
assert.equal(repaired.status, 0, repaired.stderr)
assert.equal(repaired.stdout.trim(), 'harmony')

rmSync(harmony, { recursive: true })
const withoutHarmony = runCommand()
assert.equal(withoutHarmony.status, 0, withoutHarmony.stderr)
assert.equal(withoutHarmony.stdout.trim(), 'official')

writeFileSync(join(home, 'cordis.patch.yml'), readFileSync(join(home, 'cordis.patch.yml'), 'utf8')
  .replace(/^# dsh-harmony bootstrap (?:begin|end)\n/gm, ''))
bootstrap.apply({ inject() {}, logger: { warn() {} } })
assert.equal(readFileSync(join(home, 'cordis.patch.yml'), 'utf8'), originalPatch)
assert.equal(existsSync(join(home, 'node_modules/dsh-harmony-bootstrap')), false)

const windowsCommand = join(root, 'windows/dsh')
mkdirSync(dirname(windowsCommand), { recursive: true })
installShim({ command: windowsCommand, harmony: join(root, 'missing-harmony'), official, platform: 'win32' })
assert.match(readFileSync(`${windowsCommand}.cmd`, 'utf8'), /%\*/)
assert.match(readFileSync(`${windowsCommand}.ps1`, 'utf8'), /@args/)

rmSync(root, { recursive: true })
