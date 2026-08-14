import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { publishRuntimeAddress, updateRuntimeOrder } from './control.js'
import { synchronizeProfile } from './runtime.js'
import { renderHarmonyTui, saveHarmonyTuiOrder } from './tui.js'

test('TUI shows provider order, declarations, and the conflicting pair', () => {
  const output = renderHarmonyTui({
    dir: '/profiles/web',
    order: ['late', 'early'],
    plugins: [
      { name: 'early', dir: '/early', patches: ['patch.cjs'], before: ['late'], after: [] },
      { name: 'late', dir: '/late', patches: ['patch.cjs'], before: [], after: [] },
    ],
  }, 0, '')

  expect(output).toContain('profile: web')
  expect(output).toContain('early 必须在 late 前')
  expect(output).toContain('前于 late')
})

test('TUI rejects a conflicting order before changing harmony.json', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-tui-'))
  const reader = join(profile, 'node_modules', 'reader')
  const remover = join(profile, 'node_modules', 'remover')
  const target = join(profile, 'node_modules', 'tui-target')
  mkdirSync(reader, { recursive: true })
  mkdirSync(remover, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { reader: '1', remover: '1', 'tui-target': '1' },
  }))
  for (const name of ['reader', 'remover']) {
    writeFileSync(join(profile, 'node_modules', name, 'package.json'), JSON.stringify({
      name, version: '1.0.0', dsh: { harmony: { patches: ['./patch.cjs'] } },
    }))
  }
  writeFileSync(join(reader, 'patch.cjs'), `
module.exports = {
  id: 'read', target: { package: 'tui-target', files: ['lib/index.js'] },
  select: 'NumericLiteral', expect: 1, apply() {},
}
`)
  writeFileSync(join(remover, 'patch.cjs'), `
module.exports = {
  id: 'remove', target: { package: 'tui-target', files: ['lib/index.js'] },
  select: 'NumericLiteral', expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), 'undefined') },
}
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'tui-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')
  synchronizeProfile(profile)
  const previous = readFileSync(join(profile, 'harmony.json'), 'utf8')

  await expect(saveHarmonyTuiOrder(profile, ['remover', 'reader', 'tui-target'])).rejects.toThrow('reader/read')
  expect(readFileSync(join(profile, 'harmony.json'), 'utf8')).toBe(previous)

  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({
    order: ['remover', 'reader', 'tui-target'], disabled: [],
  }))
  synchronizeProfile(profile)
  await saveHarmonyTuiOrder(profile, ['reader', 'remover', 'tui-target'])
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8')).order).toEqual(['reader', 'remover', 'tui-target'])
  rmSync(profile, { recursive: true })
})

test('TUI sends live order updates through the published runtime address', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-control-'))
  let failure = false
  let delay = 0
  let received: unknown
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    received = JSON.parse(Buffer.concat(chunks).toString())
    await new Promise(resolve => setTimeout(resolve, delay))
    response.writeHead(failure ? 500 : 200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(failure ? { error: 'reload conflict' } : { dir: profile, order: ['a'] }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const dispose = publishRuntimeAddress(profile, '127.0.0.1', (server.address() as AddressInfo).port)

  expect(await updateRuntimeOrder(profile, ['a'])).toBe(true)
  expect(received).toEqual({ order: ['a'] })
  failure = true
  delay = 1100
  await expect(updateRuntimeOrder(profile, ['b'])).rejects.toThrow('reload conflict')
  failure = false
  delay = 0
  await expect(updateRuntimeOrder(profile, ['b'])).rejects.toThrow('does not match')
  dispose()
  expect(existsSync(join(profile, '.dsh-harmony-runtime.json'))).toBe(false)

  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  rmSync(profile, { recursive: true })
})
