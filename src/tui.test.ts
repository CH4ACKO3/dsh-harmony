import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { EventEmitter } from 'node:events'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { publishRuntimeAddress, updateHarmonyProfile, updateRuntimeProfile } from './control.js'
import { synchronizeProfile } from './runtime.js'
import {
  renderHarmonyPatchTui,
  renderHarmonyTui,
  runHarmonyTui,
  saveHarmonyTuiOrder,
  saveHarmonyTuiPatchOrder,
} from './tui.js'

test('TUI shows provider order, declarations, and the conflicting pair', () => {
  const output = renderHarmonyTui({
    dir: '/profiles/web',
    order: ['late', 'early'],
    disabled: [],
    plugins: [
      { name: 'early', dir: '/early', version: '1.0.0', patches: ['patch.cjs'], before: ['late'], after: [], conflicts: { late: '*' } },
      { name: 'late', dir: '/late', version: '2.0.0', patches: ['patch.cjs'], before: [], after: [], conflicts: {} },
    ],
    pluginConflicts: [{
      left: { package: 'early', version: '1.0.0', entryIds: ['early'] },
      right: { package: 'late', version: '2.0.0', entryIds: ['late'] },
      declaredBy: ['early'],
    }],
  }, 0, '', Number.POSITIVE_INFINITY, 'zh')

  expect(output).toContain('配置: web')
  expect(output).toContain('early 必须在 late 前')
  expect(output).toContain('前于 late')
  expect(output).toContain('early@1.0.0 与 late@2.0.0 不兼容（由 early 声明）')
  expect(output).toContain('仅警告，插件仍保持启用')
})

test('TUI keeps the selected provider visible within the terminal height', () => {
  const order = Array.from({ length: 30 }, (_, index) => `provider-${index}`)
  const output = renderHarmonyTui({
    dir: '/profiles/tui',
    order,
    patchOrder: [],
    disabled: [],
    plugins: order.map(name => ({
      name,
      version: '1.0.0',
      description: '',
      harmony: true,
      patches: ['patch.cjs'],
      before: [],
      after: [],
      conflicts: {},
      author: '',
      contributors: [],
      homepage: '',
      bugs: '',
      license: '',
    })),
    orderViolations: [],
    patchOrderViolations: [],
    pluginConflicts: [],
  }, 17, '', 12, 'en')

  expect(output.split('\n')).toHaveLength(12)
  expect(output).toContain('provider-17')
  expect(output).toContain('items above')
  expect(output).toContain('items below')
})

test('TUI Patch view shows runtime state and keeps the selected Patch visible', () => {
  const patchOrder = Array.from({ length: 20 }, (_, index) => `provider/patch-${index}`)
  const output = renderHarmonyPatchTui({
    dir: '/profiles/tui',
    order: ['provider'],
    patchOrder,
    disabled: ['provider/patch-2'],
    plugins: [{
      name: 'provider', version: '1.0.0', description: '', harmony: true, patches: ['patch.cjs'],
      patchCount: 20, before: [], after: [], conflicts: {}, author: '', contributors: [], homepage: '', bugs: '', license: '',
    }],
    orderViolations: [],
    patchOrderViolations: [],
    pluginConflicts: [],
  }, patchOrder.map((key, index) => ({
    key,
    id: `patch-${index}`,
    owner: 'provider',
    index,
    targets: [{ package: 'target', file: 'lib/index.js' }],
    kind: 'source',
    state: index === 2 ? 'disabled' : index === 12 ? 'failed' : 'bound',
    matches: 1,
    generation: 4,
    declaration: '/provider/patch.cjs',
    ...(index === 12 ? { error: 'selector mismatch' } : {}),
  })), 12, '', 13, 'zh')

  expect(output.split('\n')).toHaveLength(13)
  expect(output).toContain('provider/patch-12')
  expect(output).toContain('selector mismatch')
  expect(output).toContain('项在上方')
  expect(output).toContain('项在下方')
})

test('TUI saves an order even when one Patch will be skipped', async () => {
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
  id: 'read', target: { package: 'tui-target', file: 'lib/index.js' },
  select: 'NumericLiteral', expect: 1, apply() {},
}
`)
  writeFileSync(join(remover, 'patch.cjs'), `
module.exports = {
  id: 'remove', target: { package: 'tui-target', file: 'lib/index.js' },
  select: 'NumericLiteral', expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), 'undefined') },
}
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'tui-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')
  synchronizeProfile(profile)

  await saveHarmonyTuiOrder(profile, ['remover', 'reader', 'tui-target'])
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8')).order).toEqual(['remover', 'reader', 'tui-target'])
  await saveHarmonyTuiOrder(profile, ['reader', 'remover', 'tui-target'])
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8')).order).toEqual(['reader', 'remover', 'tui-target'])
  await saveHarmonyTuiPatchOrder(profile, ['remover/remove', 'reader/read'])
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8')).patchOrder).toEqual(['remover/remove', 'reader/read'])

  const input = Object.assign(new EventEmitter(), {
    isTTY: true,
    setRawMode() {},
    resume() {},
  })
  let screen = ''
  const output = Object.assign(new EventEmitter(), {
    isTTY: true,
    rows: 18,
    columns: 100,
    write(value: string) { screen += value; return true },
  })
  const running = runHarmonyTui(profile, input as any, output as any, 'zh')
  await new Promise<void>(resolve => setImmediate(resolve))
  input.emit('keypress', '\t', { name: 'tab' })
  input.emit('keypress', ' ', { name: 'space' })
  await expect.poll(() => screen).toContain('remover/remove 已停用')
  input.emit('keypress', 'q', { name: 'q' })
  await running
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8')).disabled).toEqual(['remover/remove'])
  rmSync(profile, { recursive: true })
})

test('the unified profile API sends live updates through the published runtime address', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-control-'))
  let failure = false
  let mismatch = false
  let delay = 0
  let received: unknown
  const server = createServer(async (request, response) => {
    expect(request.headers.authorization).toBe('Bearer test-token')
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    received = JSON.parse(Buffer.concat(chunks).toString())
    await new Promise(resolve => setTimeout(resolve, delay))
    response.writeHead(failure ? 500 : 200, { 'content-type': 'application/json' })
    const input = received as { order?: string[]; patchOrder?: string[]; disabled?: string[] }
    response.end(JSON.stringify(failure ? { error: 'reload conflict' } : {
      mode: 'live',
      generation: 1,
      reload: { sequence: 1, state: 'succeeded' },
      profile: {
        dir: profile,
        order: mismatch ? ['unexpected'] : input.order ?? ['a'],
        patchOrder: input.patchOrder ?? [],
        disabled: [...new Set(input.disabled ?? [])],
        plugins: [], orderViolations: [], patchOrderViolations: [], pluginConflicts: [],
      },
    }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const token = 'test-token'
  const dispose = publishRuntimeAddress(profile, `http://127.0.0.1:${(server.address() as AddressInfo).port}`, token)

  expect(await updateHarmonyProfile(profile, { order: ['a'] })).toMatchObject({
    mode: 'live', profile: { dir: profile, order: ['a'] },
  })
  expect(received).toEqual({ order: ['a'] })
  expect(await updateHarmonyProfile(profile, {
    patchOrder: ['provider/patch'], disabled: ['provider/patch', 'provider/patch'],
  })).toMatchObject({
    mode: 'live',
    profile: { patchOrder: ['provider/patch'], disabled: ['provider/patch'] },
  })
  expect(received).toEqual({
    patchOrder: ['provider/patch'], disabled: ['provider/patch', 'provider/patch'],
  })
  failure = true
  delay = 1100
  await expect(updateRuntimeProfile(profile, { order: ['b'] })).rejects.toThrow('reload conflict')
  failure = false
  mismatch = true
  delay = 0
  await expect(updateRuntimeProfile(profile, { order: ['b'] })).rejects.toThrow('does not match')
  mismatch = false
  dispose()
  expect(existsSync(join(profile, '.dsh-harmony-runtime.json'))).toBe(false)
  expect(await updateRuntimeProfile(profile, { order: ['a'] })).toBeUndefined()

  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  rmSync(profile, { recursive: true })
})
