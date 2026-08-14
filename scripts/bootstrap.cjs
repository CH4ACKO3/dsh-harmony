const { spawn } = require('node:child_process')
const { existsSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync } = require('node:fs')
const { createRequire } = require('node:module')
const { dirname, join } = require('node:path')

const SHIM_MARKER = '// dsh-harmony shim'
const BOOTSTRAP_START = '# dsh-harmony bootstrap begin'
const BOOTSTRAP_END = '# dsh-harmony bootstrap end'
const stateDir = __dirname
const home = dirname(dirname(stateDir))
const patch = join(home, 'cordis.patch.yml')
const installationFile = join(stateDir, 'installation.json')
let restartRequired = false

function sendJson(response, value) {
  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

function cleanBootstrap(installation) {
  const source = readFileSync(patch, 'utf8')
  const start = source.indexOf(BOOTSTRAP_START)
  const end = source.indexOf(BOOTSTRAP_END, start)
  let cleaned
  if (start !== -1 && end !== -1) {
    cleaned = `${source.slice(0, start)}${source.slice(end + BOOTSTRAP_END.length)}`.trim()
  } else {
    const { dump, load } = createRequire(installation.official)('js-yaml')
    const entries = load(source)
    if (!Array.isArray(entries)) throw new Error(`${patch} must contain a top-level YAML array`)
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

function installRestartRoute(ctx, installation) {
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

function apply(ctx) {
  const installation = JSON.parse(readFileSync(installationFile, 'utf8'))
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

module.exports = { apply, inject: ['appExit'] }
