import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import {
  preflightHarmonyProfileUpdate,
  readHarmonyProfile,
  updateHarmonyProfile,
} from './index.js'
import { synchronizeHarmonyProfile } from './profile.js'

test('profile order appends installed providers and removes uninstalled providers', () => {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-profile-'))
  mkdirSync(join(profile, 'node_modules', 'first'), { recursive: true })
  mkdirSync(join(profile, 'node_modules', 'second'), { recursive: true })
  mkdirSync(join(profile, 'node_modules', 'ordinary'), { recursive: true })
  for (const name of ['first', 'second']) {
    writeFileSync(join(profile, 'node_modules', name, 'package.json'), JSON.stringify({
      name,
      dsh: { harmony: {
        patches: ['./patch.cjs'],
        conflicts: name === 'first' ? ['second', 'ordinary', 'first'] : [],
      } },
    }))
  }
  writeFileSync(join(profile, 'node_modules', 'ordinary', 'package.json'), JSON.stringify({
    name: 'ordinary',
    version: '1.2.3',
    description: 'No patches here.',
    author: { name: 'Example Author' },
    contributors: ['One', { name: 'Two' }],
    homepage: 'https://example.com',
    bugs: { url: 'https://example.com/issues' },
    license: 'MIT',
  }))
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { first: '1', second: '1', ordinary: '1' } }))
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({ order: ['second'], patchOrder: [], disabled: [] }))

  const synchronized = synchronizeHarmonyProfile(profile)
  expect(synchronized.order).toEqual(['second', 'first', 'ordinary'])
  expect(synchronized.plugins.find(plugin => plugin.name === 'first')?.conflicts).toEqual([
    'second', 'ordinary', 'first',
  ])
  expect(synchronized.incompatibilities).toEqual([{ declaredBy: 'first', conflictsWith: 'second' }])
  expect(synchronized.plugins.find(plugin => plugin.name === 'ordinary')).toMatchObject({
    patches: [],
    version: '1.2.3',
    description: 'No patches here.',
    author: 'Example Author',
    contributors: ['One', 'Two'],
    homepage: 'https://example.com',
    bugs: 'https://example.com/issues',
    license: 'MIT',
  })

  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({ order: synchronized.order, patchOrder: [], disabled: ['first/*'] }))
  expect(synchronizeHarmonyProfile(profile).incompatibilities).toEqual([])
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({ order: synchronized.order, patchOrder: [], disabled: ['second/*'] }))
  expect(synchronizeHarmonyProfile(profile).incompatibilities).toEqual([])
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({ order: synchronized.order, patchOrder: [], disabled: ['first/test'] }))
  expect(synchronizeHarmonyProfile(profile).incompatibilities).toEqual([{
    declaredBy: 'first', conflictsWith: 'second',
  }])
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({ order: synchronized.order, patchOrder: [], disabled: [] }))

  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { first: '1' } }))
  rmSync(join(profile, 'node_modules', 'second'), { recursive: true })
  rmSync(join(profile, 'node_modules', 'ordinary'), { recursive: true })
  expect(synchronizeHarmonyProfile(profile).order).toEqual(['first'])
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8'))).toEqual({
    order: ['first'], patchOrder: [], disabled: [],
  })
  rmSync(profile, { recursive: true })
})

test('pins dsh-harmony above every installed plugin', () => {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-profile-'))
  mkdirSync(join(profile, 'node_modules', 'ordinary'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), '{}')
  writeFileSync(join(profile, 'node_modules', 'ordinary', 'package.json'), JSON.stringify({ name: 'ordinary' }))
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({
    order: ['ordinary', 'dsh-harmony'], patchOrder: [], disabled: [],
  }))

  expect(synchronizeHarmonyProfile(profile, ['ordinary', 'dsh-harmony']).order).toEqual(['dsh-harmony', 'ordinary'])
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8'))).toEqual({
    order: ['dsh-harmony', 'ordinary'],
    patchOrder: [],
    disabled: [],
  })
  rmSync(profile, { recursive: true })
})

test('rejects an incomplete persisted Harmony state', () => {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-profile-'))
  writeFileSync(join(profile, 'package.json'), '{}')
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({ order: [] }))

  expect(() => synchronizeHarmonyProfile(profile)).toThrow('patchOrder must be an array')
  rmSync(profile, { recursive: true })
})

test('reads, preflights, and atomically updates a stopped profile', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-profile-api-'))
  for (const name of ['first', 'second']) {
    mkdirSync(join(profile, 'node_modules', name), { recursive: true })
    writeFileSync(join(profile, 'node_modules', name, 'package.json'), JSON.stringify({
      name,
      version: '1.0.0',
      dsh: { harmony: { patches: [`./${name}.patch.cjs`], after: name === 'first' ? ['second'] : [] } },
    }))
  }
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { first: '1', second: '1' } }))
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({
    order: ['first'],
    patchOrder: ['first/b', 'second/only', 'first/a'],
    disabled: [],
  }))

  const before = readFileSync(join(profile, 'harmony.json'), 'utf8')
  const view = readHarmonyProfile(profile)
  expect(view).toMatchObject({
    dir: profile,
    order: ['first', 'second'],
    disabled: [],
    orderViolations: [{ before: 'second', after: 'first', declaredBy: 'first' }],
  })
  expect(view.plugins.find(plugin => plugin.name === 'first')).toMatchObject({
    harmony: true,
    patches: ['./first.patch.cjs'],
  })
  expect(readFileSync(join(profile, 'harmony.json'), 'utf8')).toBe(before)

  expect(preflightHarmonyProfileUpdate(profile, {
    order: ['second', 'first'],
    disabled: ['first/*', 'first/*'],
  })).toMatchObject({
    order: ['second', 'first'],
    patchOrder: ['second/only', 'first/b', 'first/a'],
    disabled: ['first/*'],
    orderViolations: [],
    incompatibilities: [],
  })
  expect(readFileSync(join(profile, 'harmony.json'), 'utf8')).toBe(before)

  expect(() => preflightHarmonyProfileUpdate(profile, { order: ['first', 'first'] }))
    .toThrow('duplicate package "first"')
  expect(() => preflightHarmonyProfileUpdate(profile, { order: ['first'] }))
    .toThrow('omits installed package "second"')
  expect(() => preflightHarmonyProfileUpdate(profile, { order: ['first', 'unknown'] }))
    .toThrow('unknown package "unknown"')
  expect(() => preflightHarmonyProfileUpdate(profile, { disabled: [1] as unknown as string[] }))
    .toThrow('disabled must be an array of non-empty strings')

  const updated = await updateHarmonyProfile(profile, { order: ['second', 'first'], disabled: ['first/*'] })
  expect(updated).toMatchObject({
    order: ['second', 'first'],
    patchOrder: ['second/only', 'first/b', 'first/a'],
    disabled: ['first/*'],
  })
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8'))).toEqual({
    order: ['second', 'first'],
    patchOrder: ['second/only', 'first/b', 'first/a'],
    disabled: ['first/*'],
  })
  rmSync(profile, { recursive: true })
})
