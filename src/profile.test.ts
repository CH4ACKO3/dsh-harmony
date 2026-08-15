import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { synchronizeHarmonyProfile } from './profile.js'

test('profile order appends installed providers and removes uninstalled providers', () => {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-profile-'))
  mkdirSync(join(profile, 'node_modules', 'first'), { recursive: true })
  mkdirSync(join(profile, 'node_modules', 'second'), { recursive: true })
  mkdirSync(join(profile, 'node_modules', 'ordinary'), { recursive: true })
  for (const name of ['first', 'second']) {
    writeFileSync(join(profile, 'node_modules', name, 'package.json'), JSON.stringify({
      name,
      dsh: { harmony: { patches: ['./patch.cjs'] } },
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
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({ order: ['second'], disabled: [] }))

  const synchronized = synchronizeHarmonyProfile(profile)
  expect(synchronized.order).toEqual(['second', 'first', 'ordinary'])
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

  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { first: '1' } }))
  rmSync(join(profile, 'node_modules', 'second'), { recursive: true })
  rmSync(join(profile, 'node_modules', 'ordinary'), { recursive: true })
  expect(synchronizeHarmonyProfile(profile).order).toEqual(['first'])
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8'))).toEqual({ order: ['first'], disabled: [] })
  rmSync(profile, { recursive: true })
})

test('pins dsh-harmony above every installed plugin', () => {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-profile-'))
  mkdirSync(join(profile, 'node_modules', 'ordinary'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), '{}')
  writeFileSync(join(profile, 'node_modules', 'ordinary', 'package.json'), JSON.stringify({ name: 'ordinary' }))
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({ order: ['ordinary', 'dsh-harmony'], disabled: [] }))

  expect(synchronizeHarmonyProfile(profile, ['ordinary', 'dsh-harmony']).order).toEqual(['dsh-harmony', 'ordinary'])
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8'))).toEqual({
    order: ['dsh-harmony', 'ordinary'],
    disabled: [],
  })
  rmSync(profile, { recursive: true })
})

test('treats a missing disabled list as empty', () => {
  const profile = mkdtempSync(join(tmpdir(), 'dsh-harmony-profile-'))
  writeFileSync(join(profile, 'package.json'), '{}')
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({ order: [] }))

  expect(synchronizeHarmonyProfile(profile).disabled).toEqual([])
  rmSync(profile, { recursive: true })
})
