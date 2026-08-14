import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

type RuntimeAction = 'install' | 'install-restart' | 'remove' | 'ignore'
type RuntimeState = 'missing' | 'working' | 'installed' | 'removed' | 'ignored' | 'error'

interface RuntimeStatus {
  state: RuntimeState
  bootId: number
  error?: string
}

interface ActionResult {
  restartCommand?: string
}

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const restartScript = join(packageRoot, 'scripts/restart.cjs')
const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as { name: string; version: string }
const packageName = manifest.name
const packageSpec = `${manifest.name}@${manifest.version}`
const require = createRequire(import.meta.url)
const { resolveCommandPath } = require('../scripts/install-shim.cjs') as {
  resolveCommandPath(prefix: string, platform?: NodeJS.Platform): string
}

function sendJson(response: any, value: unknown): void {
  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

function run(command: string, args: string[], inherit = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', chunk => { stdout += chunk })
    child.stderr?.on('data', chunk => { stderr += chunk })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(stderr.trim() || `${command} exited with code ${code}`))
    })
  })
}

function runNpm(args: string[], inherit = false): Promise<string> {
  if (process.platform !== 'win32') return run('npm', args, inherit)
  return run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `npm.cmd ${args.join(' ')}`], inherit)
}

function invocationProfile(): string {
  const args = process.argv.slice(2)
  if (args[0] === 'web') return 'web'
  const option = args.findIndex(arg => arg === '--profile' || arg.startsWith('--profile='))
  if (option === -1) throw new Error('Cannot remove dsh-harmony without a profile name')
  return args[option] === '--profile' ? args[option + 1]! : args[option]!.slice('--profile='.length)
}

function webInvocation(): boolean {
  const args = process.argv.slice(2)
  if (args[0] === 'web') return true
  const option = args.findIndex(arg => arg === '--profile' || arg.startsWith('--profile='))
  const profile = option === -1 ? undefined
    : args[option] === '--profile' ? args[option + 1] : args[option]!.slice('--profile='.length)
  return profile === 'web'
}

async function installRuntime(): Promise<string> {
  await runNpm(['install', '--global', packageSpec], process.stdin.isTTY)
  const prefix = await runNpm(['prefix', '--global'])
  return resolveCommandPath(prefix)
}

async function removePlugin(): Promise<void> {
  await run(process.execPath, [process.argv[1]!, 'plugin', '--profile', invocationProfile(), 'remove', packageName], process.stdin.isTTY)
}

function restart(ctx: any, command: string): void {
  const helper = spawn(process.execPath, [
    restartScript,
    String(process.pid),
    command,
    JSON.stringify(process.argv.slice(2)),
  ], { detached: true, env: process.env, stdio: 'inherit' })
  helper.unref()
  ctx.appExit(0)
}

async function terminalChoice(): Promise<RuntimeAction> {
  const input = createInterface({ input: process.stdin, output: process.stdout })
  try {
    process.stdout.write('\ndsh-harmony is installed as a plugin, but its launcher is not active.\n')
    process.stdout.write('  1. Install\n  2. Install and restart\n  3. Remove plugin\n  4. Ignore once\n')
    while (true) {
      const answer = (await input.question('Choose [1-4]: ')).trim()
      const action = ({ 1: 'install', 2: 'install-restart', 3: 'remove', 4: 'ignore' } as Record<string, RuntimeAction>)[answer]
      if (action !== undefined) return action
    }
  } finally {
    input.close()
  }
}

export async function waitForRuntimeChoice(ctx: any): Promise<void> {
  if (process.env.DSH_HARMONY_IGNORE_ONCE === '1') return

  let status: RuntimeStatus = { state: 'missing', bootId: process.pid }
  let finish!: () => void
  const choice = new Promise<void>(resolve => { finish = resolve })

  const act = async (action: RuntimeAction): Promise<ActionResult> => {
    status = { state: 'working', bootId: process.pid }
    try {
      if (action === 'ignore') {
        process.env.DSH_HARMONY_IGNORE_ONCE = '1'
        status = { state: 'ignored', bootId: process.pid }
        finish()
        return {}
      }
      if (action === 'remove') {
        await removePlugin()
        status = { state: 'removed', bootId: process.pid }
        return {}
      }
      const command = await installRuntime()
      status = { state: 'installed', bootId: process.pid }
      if (action === 'install') return {}
      return { restartCommand: command }
    } catch (error) {
      status = { state: 'error', bootId: process.pid, error: error instanceof Error ? error.message : String(error) }
      return {}
    }
  }

  ctx.inject(['webServer'], (webCtx: any) => webCtx.webServer.register({
    kind: 'exact',
    path: '/dsh-harmony/runtime',
    async handler(request: any, response: any) {
      if (request.method === 'GET') return sendJson(response, status)
      if (request.method !== 'POST') {
        response.writeHead(405)
        response.end()
        return
      }
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const { action } = JSON.parse(Buffer.concat(chunks).toString()) as { action: RuntimeAction }
      if (!['install', 'install-restart', 'remove', 'ignore'].includes(action)) {
        response.writeHead(400)
        response.end()
        return
      }
      const result = await act(action)
      sendJson(response, status)
      if (status.state === 'removed') setImmediate(() => ctx.appExit(0))
      if (status.state === 'installed' && action === 'install') setImmediate(() => ctx.appExit(0))
      if (result.restartCommand !== undefined) setImmediate(() => restart(ctx, result.restartCommand!))
    },
  }))

  if (!webInvocation()) {
    if (!process.stdin.isTTY) throw new Error('dsh-harmony launcher is not active; run npm install -g dsh-harmony or start dsh in a terminal')
    const action = await terminalChoice()
    const result = await act(action)
    if (status.state === 'error') throw new Error(status.error)
    if (action === 'remove') return ctx.appExit(0)
    if (result.restartCommand !== undefined) return restart(ctx, result.restartCommand)
    if (action === 'install') {
      process.stdout.write('dsh-harmony installed. Run dsh again to enable patches.\n')
      return ctx.appExit(0)
    }
  }

  await choice
}

export function registerActiveRuntimeRoute(ctx: any): void {
  ctx.inject(['webServer'], (webCtx: any) => webCtx.webServer.register({
    kind: 'exact',
    path: '/dsh-harmony/runtime',
    handler(request: any, response: any) {
      if (request.method === 'GET') return sendJson(response, { state: 'active', bootId: process.pid })
      response.writeHead(405)
      response.end()
    },
  }))
}
