import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
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
const harmonyVersion = JSON.parse(readFileSync('package.json', 'utf8')).version

interface RuntimeStatus {
  state: 'missing' | 'desktop-inactive' | 'ignored' | 'installed'
}

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
  dependencies: { 'dsh-harmony': harmonyVersion },
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

const freePort = () => new Promise<number>((resolvePort, reject) => {
  const server = createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address() as AddressInfo
    server.close(() => resolvePort(address.port))
  })
})

async function startRuntime(env: NodeJS.ProcessEnv = {}) {
  const port = await freePort()
  const child = spawn(process.execPath, [official, 'web', '--port', String(port)], {
    env: {
      ...process.env,
      DSH_HOME: home,
      PATH: `${fakeBin}${delimiter}${process.env.PATH}`,
      DSH_HARMONY_ACTIVE: '',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const childExit = new Promise(resolveExit => child.once('exit', resolveExit))
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  return { child, childExit, url: `http://127.0.0.1:${port}`, output: () => output }
}

function waitForStatus(runtime: Awaited<ReturnType<typeof startRuntime>>): Promise<RuntimeStatus> {
  return new Promise<RuntimeStatus>((resolveStatus, reject) => {
    const deadline = Date.now() + 10_000
    const poll = async () => {
      try {
        const response = await fetch(`${runtime.url}/dsh-harmony/runtime`)
        if (response.ok) return resolveStatus(await response.json() as RuntimeStatus)
      } catch {}
      if (Date.now() >= deadline) return reject(new Error(`runtime prompt did not start:\n${runtime.output()}`))
      setTimeout(poll, 100)
    }
    void poll()
  })
}

const desktop = await startRuntime({ DSH_DESKTOP: '1' })
assert.equal((await waitForStatus(desktop)).state, 'desktop-inactive')
const blockedInstall = await fetch(`${desktop.url}/dsh-harmony/runtime`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'install' }),
})
assert.equal(blockedInstall.status, 400)
assert.equal(existsSync(npmLog), false)
const ignored = await fetch(`${desktop.url}/dsh-harmony/runtime`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'ignore' }),
})
assert.equal((await ignored.json() as RuntimeStatus).state, 'ignored')
desktop.child.kill()
await desktop.childExit

const runtime = await startRuntime()
const url = runtime.url
const status = await waitForStatus(runtime)
assert.equal(status.state, 'missing')
const client = await fetch(`${url}/plugins/dsh-harmony/client.js`)
assert.equal(client.ok, true, runtime.output())
assert.match(await client.text(), /Install and restart/)
assert.equal(existsSync(dependentMarker), false)

const response = await fetch(`${url}/dsh-harmony/runtime`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'install' }),
})
assert.equal(response.ok, true)
assert.equal((await response.json() as RuntimeStatus).state, 'installed')
assert.equal(readFileSync(npmLog, 'utf8'), `install --global dsh-harmony@${harmonyVersion}\nprefix --global\n`)
assert.equal(await runtime.childExit, 0, runtime.output())
assert.equal(existsSync(dependentMarker), false)
rmSync(root, { recursive: true })
