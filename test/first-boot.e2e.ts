import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'dsh-harmony-first-boot-'))
const child = spawn(process.execPath, ['lib/bin.js', 'web', '--port', '0'], {
  env: { ...process.env, DSH_HOME: home },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
await new Promise<void>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`first boot timed out:\n${output}`)), 10_000)
  const read = (chunk: Buffer) => {
    output += chunk
    if (!output.includes('dsh web: http://127.0.0.1:')) return
    clearTimeout(timer)
    resolve()
  }
  child.stdout.on('data', read)
  child.stderr.on('data', read)
  child.once('exit', code => {
    clearTimeout(timer)
    reject(new Error(`first boot exited ${code}:\n${output}`))
  })
})

assert.match(output, /dsh web: http:\/\/127\.0\.0\.1:/)
child.kill()
await new Promise(resolve => child.once('exit', resolve))
rmSync(home, { recursive: true })

const equalsHome = mkdtempSync(join(tmpdir(), 'dsh-harmony-profile-equals-'))
const dump = spawnSync(process.execPath, ['lib/bin.js', '--profile=web', '--dump-config'], {
  encoding: 'utf8',
  env: { ...process.env, DSH_HOME: equalsHome },
})
assert.equal(dump.status, 0, dump.stderr)
assert.match(dump.stdout, /id: harmony\s+name: dsh-harmony/)
rmSync(equalsHome, { recursive: true })

const tuiHome = mkdtempSync(join(tmpdir(), 'dsh-harmony-first-tui-'))
const tui = spawnSync(process.execPath, ['lib/bin.js', 'harmony'], {
  encoding: 'utf8',
  env: { ...process.env, DSH_HOME: tuiHome },
})
assert.notEqual(tui.status, 0)
assert.equal(existsSync(join(tuiHome, 'profiles', 'web', 'package.json')), true)
rmSync(tuiHome, { recursive: true })

const missingProfileHome = mkdtempSync(join(tmpdir(), 'dsh-harmony-missing-profile-'))
const missingProfile = spawnSync(process.execPath, ['lib/bin.js', 'harmony', '--profile'], {
  encoding: 'utf8',
  env: { ...process.env, DSH_HOME: missingProfileHome },
})
assert.notEqual(missingProfile.status, 0)
assert.match(missingProfile.stderr, /argument missing/)
assert.equal(existsSync(join(missingProfileHome, 'profiles', 'web', 'package.json')), false)
rmSync(missingProfileHome, { recursive: true })
