import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { ensureBootstrap } = require('../scripts/install-shim.cjs') as {
  ensureBootstrap(paths: { home: string; command: string; official: string; harmony: string }): void
}
interface RuntimeStatus { restart: boolean; bootId: number }
const root = mkdtempSync(join(tmpdir(), 'dsh-harmony-bootstrap-'))
const home = join(root, 'home')
const command = join(root, 'bin/dsh')
const official = resolve('node_modules/@deepseek-ai/dsh/lib/bin.js')
const harmony = resolve('lib/bin.js')

mkdirSync(dirname(command), { recursive: true })
copyFileSync(official, command)
ensureBootstrap({ home, command, official, harmony })

const port = await new Promise<number>((resolvePort, reject) => {
  const server = createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address() as AddressInfo
    server.close(() => resolvePort(address.port))
  })
})
const child = spawn(process.execPath, [official, 'web', '--port', String(port), '--no-open'], {
  env: { ...process.env, DSH_HOME: home },
  stdio: ['ignore', 'pipe', 'pipe'],
})
const firstExit = new Promise(resolveExit => child.once('exit', resolveExit))
let output = ''
const url = await new Promise<string>((resolveUrl, reject) => {
  const timer = setTimeout(() => reject(new Error(`bootstrap boot timed out:\n${output}`)), 10_000)
  const read = (chunk: Buffer) => {
    output += chunk
    const match = output.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+)/)
    if (!match) return
    clearTimeout(timer)
    resolveUrl(match[1])
  }
  child.stdout.on('data', read)
  child.stderr.on('data', read)
  child.once('exit', code => {
    clearTimeout(timer)
    reject(new Error(`bootstrap boot exited ${code}:\n${output}`))
  })
})

const status = await fetch(`${url}/dsh-harmony-bootstrap/restart`).then(response => response.json() as Promise<RuntimeStatus>)
assert.equal(status.restart, true)
const html = await fetch(url).then(response => response.text())
assert.match(html, /dsh-harmony-bootstrap/)
const client = await fetch(`${url}/plugins/dsh-harmony-bootstrap/client.js`).then(response => response.text())
assert.match(client, /Restart now/)
assert.match(client, /立刻重启/)

const restart = await fetch(`${url}/dsh-harmony-bootstrap/restart`, { method: 'POST' })
assert.equal(restart.ok, true)
await firstExit
const next = await new Promise<RuntimeStatus>((resolveStatus, reject) => {
  const deadline = Date.now() + 10_000
  const poll = async () => {
    try {
      const current = await fetch(`${url}/dsh-harmony-bootstrap/restart`).then(response => response.json() as Promise<RuntimeStatus>)
      if (current.bootId !== status.bootId) return resolveStatus(current)
    } catch {}
    if (Date.now() >= deadline) return reject(new Error(`restarted dsh did not become ready:\n${output}`))
    setTimeout(poll, 100)
  }
  void poll()
})
assert.equal(next.restart, false)
const harmonyHtml = await fetch(url).then(response => response.text())
assert.match(harmonyHtml, /dsh-harmony/)

process.kill(next.bootId, 'SIGTERM')
await new Promise<void>(resolveExit => {
  const poll = () => {
    try {
      process.kill(next.bootId, 0)
      setTimeout(poll, 50)
    } catch {
      resolveExit()
    }
  }
  poll()
})
rmSync(root, { recursive: true })
