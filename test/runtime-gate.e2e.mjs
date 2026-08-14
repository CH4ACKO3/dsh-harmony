import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'

const root = mkdtempSync(join(tmpdir(), 'dsh-harmony-runtime-gate-'))
const home = join(root, 'home')
const profile = join(home, 'profiles/web')
const fakeBin = join(root, 'bin')
const prefix = join(root, 'prefix')
const npmLog = join(root, 'npm.log')
const dependentMarker = join(root, 'dependent-ran')
const harmonyRoot = resolve('.')
const official = resolve('node_modules/@deepseek-ai/dsh/lib/bin.js')

mkdirSync(join(profile, 'node_modules'), { recursive: true })
mkdirSync(fakeBin, { recursive: true })
symlinkSync(harmonyRoot, join(profile, 'node_modules/dsh-harmony'), process.platform === 'win32' ? 'junction' : 'dir')
mkdirSync(join(profile, 'node_modules/harmony-dependent'))
writeFileSync(join(profile, 'node_modules/harmony-dependent/package.json'), `${JSON.stringify({
  name: 'harmony-dependent',
  type: 'module',
  exports: './index.js',
})}\n`)
writeFileSync(join(profile, 'node_modules/harmony-dependent/index.js'), `
import { writeFileSync } from 'node:fs'
export const inject = ['harmony']
export function apply() { writeFileSync(${JSON.stringify(dependentMarker)}, 'ran') }
`)
writeFileSync(join(profile, 'package.json'), `${JSON.stringify({
  name: 'dsh-profile-web',
  private: true,
  dependencies: { 'dsh-harmony': '0.1.0' },
  dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-harmony'] } },
}, null, 2)}\n`)
writeFileSync(join(profile, 'cordis.patch.yml'), '- insert:\n    - id: harmony-dependent\n      name: harmony-dependent\n')
const fakeNpm = join(fakeBin, 'npm.cjs')
writeFileSync(fakeNpm, `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
appendFileSync(${JSON.stringify(npmLog)}, process.argv.slice(2).join(' ') + '\\n')
if (process.argv[2] === 'prefix') process.stdout.write(${JSON.stringify(prefix)} + '\\n')
`)
if (process.platform === 'win32') {
  writeFileSync(join(fakeBin, 'npm.cmd'), `@"${process.execPath}" "${fakeNpm}" %*\r\n`)
} else {
  writeFileSync(join(fakeBin, 'npm'), `#!/usr/bin/env node\nrequire(${JSON.stringify(fakeNpm)})\n`)
  chmodSync(join(fakeBin, 'npm'), 0o755)
}

const port = await new Promise((resolvePort, reject) => {
  const server = createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    server.close(() => resolvePort(address.port))
  })
})
const child = spawn(process.execPath, [official, 'web', '--port', String(port)], {
  env: {
    ...process.env,
    DSH_HOME: home,
    PATH: `${fakeBin}${delimiter}${process.env.PATH}`,
    DSH_HARMONY_ACTIVE: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
const childExit = new Promise(resolveExit => child.once('exit', resolveExit))
let output = ''
child.stdout.on('data', chunk => { output += chunk })
child.stderr.on('data', chunk => { output += chunk })

const url = `http://127.0.0.1:${port}`
const status = await new Promise((resolveStatus, reject) => {
  const deadline = Date.now() + 10_000
  const poll = async () => {
    try {
      const response = await fetch(`${url}/dsh-harmony/runtime`)
      if (response.ok) return resolveStatus(await response.json())
    } catch {}
    if (Date.now() >= deadline) return reject(new Error(`runtime prompt did not start:\n${output}`))
    setTimeout(poll, 100)
  }
  void poll()
})
assert.equal(status.state, 'missing')
const client = await fetch(`${url}/plugins/dsh-harmony/client.js`)
assert.equal(client.ok, true, output)
assert.match(await client.text(), /Install and restart/)
assert.equal(existsSync(dependentMarker), false)

const response = await fetch(`${url}/dsh-harmony/runtime`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'install' }),
})
assert.equal(response.ok, true)
assert.equal((await response.json()).state, 'installed')
assert.match(readFileSync(npmLog, 'utf8'), /install --global dsh-harmony@0\.1\.0/)
assert.equal(await childExit, 0, output)
assert.equal(existsSync(dependentMarker), false)
rmSync(root, { recursive: true })
