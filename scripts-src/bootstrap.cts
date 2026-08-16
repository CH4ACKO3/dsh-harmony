import { spawn } from 'node:child_process'
import { existsSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const SHIM_MARKER = '// dsh-harmony shim'
const BOOTSTRAP_START = '# dsh-harmony bootstrap begin'
const BOOTSTRAP_END = '# dsh-harmony bootstrap end'
const stateDir = __dirname
const home = dirname(dirname(stateDir))
const patch = join(home, 'cordis.patch.yml')
const installationFile = join(stateDir, 'installation.json')
let restartRequired = false

interface Installation {
  command: string
  harmony: string
  official: string
}

interface LegacyPatchEntry {
  insert?: Array<{ id?: string; name?: string }>
}

interface BootstrapContext {
  appExit(code: number): void
  inject(services: string[], callback: (ctx: WebContext) => unknown): void
  logger: { warn(message: string): void }
}

interface WebContext {
  webServer: {
    register(route: {
      kind: 'exact'
      path: string
      handler(request: IncomingMessage, response: ServerResponse): unknown
    }): unknown
  }
}

function sendJson(response: ServerResponse, value: unknown): void {
  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

function cleanBootstrap(installation: Installation): void {
  const source = readFileSync(patch, 'utf8')
  const start = source.indexOf(BOOTSTRAP_START)
  const end = source.indexOf(BOOTSTRAP_END, start)
  let cleaned
  if (start !== -1 && end !== -1) {
    cleaned = `${source.slice(0, start)}${source.slice(end + BOOTSTRAP_END.length)}`.trim()
  } else {
    const { dump, load } = createRequire(installation.official)('js-yaml') as {
      dump(value: unknown, options: { lineWidth: number }): string
      load(value: string): unknown
    }
    const value = load(source)
    if (!Array.isArray(value)) throw new Error(`${patch} must contain a top-level YAML array`)
    const entries = value as LegacyPatchEntry[]
    for (const entry of entries) {
      if (Array.isArray(entry?.insert)) {
        entry.insert = entry.insert.filter(item => item?.id !== 'harmony-bootstrap' && item?.name !== 'dsh-harmony-bootstrap')
      }
    }
    cleaned = dump(entries.filter(entry => !Array.isArray(entry?.insert) || entry.insert.length > 0), { lineWidth: -1 }).trim()
  }
  const content = cleaned.split('\n').some(line => line.trim() !== '' && !line.trim().startsWith('#'))
    ? `${cleaned}\n`
    : '[]\n'
  const temporary = `${patch}.${process.pid}.tmp`
  writeFileSync(temporary, content)
  renameSync(temporary, patch)
  for (const file of ['bootstrap.cjs', 'client.js', 'installation.json', 'package.json', 'restart.cjs']) {
    unlinkSync(join(stateDir, file))
  }
  rmdirSync(stateDir)
}

function installRestartRoute(ctx: BootstrapContext, installation: Installation): void {
  ctx.inject(['webServer'], (webCtx) => webCtx.webServer.register({
    kind: 'exact',
    path: '/dsh-harmony-bootstrap/restart',
    handler(request, response) {
      if (request.method === 'GET') {
        return sendJson(response, { restart: restartRequired, bootId: process.pid })
      }
      if (request.method !== 'POST' || !restartRequired) {
        response.writeHead(request.method === 'POST' ? 409 : 405)
        response.end()
        return
      }

      restartRequired = false
      sendJson(response, { restarting: true })
      const helper = spawn(process.execPath, [
        join(stateDir, 'restart.cjs'),
        String(process.pid),
        installation.command,
        JSON.stringify(process.argv.slice(2)),
      ], { detached: true, env: process.env, stdio: 'inherit' })
      helper.unref()
      setImmediate(() => ctx.appExit(0))
    },
  }))
}

function apply(ctx: BootstrapContext): void {
  const installation = JSON.parse(readFileSync(installationFile, 'utf8')) as Installation
  if (!existsSync(installation.harmony)) {
    cleanBootstrap(installation)
    return
  }

  const command = existsSync(installation.command) ? readFileSync(installation.command, 'utf8') : ''
  if (!command.includes(SHIM_MARKER)) {
    const { installShim } = require(join(dirname(dirname(installation.harmony)), 'scripts/install-shim.cjs'))
    installShim(installation)
    restartRequired = true
    ctx.logger.warn('Harmony launcher has been restored. Restart dsh to enable Harmony.')
  }
  installRestartRoute(ctx, installation)
}

const inject = ['appExit']

export { apply, inject }
