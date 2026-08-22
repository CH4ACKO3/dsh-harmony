import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { satisfies } from 'semver'

const root = mkdtempSync(join(tmpdir(), 'dsh-harmony-package-'))
const prefix = join(root, 'prefix')
const home = join(root, 'home')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const binDir = process.platform === 'win32' ? prefix : join(prefix, 'bin')
const dsh = process.platform === 'win32' ? join(prefix, 'dsh.cmd') : join(binDir, 'dsh')
const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
  name: string
  version: string
  peerDependencies: Record<string, string>
}
const tarball = join(root, `${manifest.name}-${manifest.version}.tgz`)
const dshRange = manifest.peerDependencies['@deepseek-ai/dsh']!

function run(command: string, args: string[], env: NodeJS.ProcessEnv = process.env): string {
  const result = spawnSync(command, args, { cwd: resolve('.'), encoding: 'utf8', env })
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}${result.stderr}`)
  return result.stdout
}

try {
  run(npm, ['pack', '--pack-destination', root])
  assert.equal(existsSync(tarball), true)
  const installEnv = {
    ...process.env,
    DSH_HOME: home,
  }
  run(npm, ['install', '--global', '--prefix', prefix, `@deepseek-ai/dsh@${dshRange}`], installEnv)
  run(npm, ['install', '--global', '--prefix', prefix, tarball], installEnv)

  const env = {
    ...installEnv,
    PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
  }
  const dshVersion = run(dsh, ['--version'], env).match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)?.[0]
  assert.ok(dshVersion)
  assert.equal(satisfies(dshVersion, dshRange), true)
  const config = run(dsh, ['web', '--dump-config'], env)
  assert.match(config, /dsh-harmony-bootstrap/)
  assert.match(config, /id: harmony\s+name: dsh-harmony/)
  assert.match(config, /id: harmony-settings\s+name: dsh-harmony\/settings/)
} finally {
  rmSync(root, { recursive: true })
}
