import { expect, test } from 'vitest'
import { evaluatePluginCompatibility, parsePluginCompatibility } from './compatibility.js'

const empty = () => ({ requires: {}, conflicts: {}, integrates: {} })

test('parses compatibility declarations strictly', () => {
  expect(parsePluginCompatibility({
    requires: { beta: '*' },
    conflicts: { gamma: '<2' },
    integrates: { delta: '^3' },
  }, 'alpha')).toEqual({
    requires: { beta: '*' },
    conflicts: { gamma: '<2' },
    integrates: { delta: '^3' },
  })
  expect(parsePluginCompatibility(undefined, 'alpha')).toEqual(empty())
  expect(() => parsePluginCompatibility(['beta'], 'alpha')).toThrow('dsh.plugin.compatibility must be an object')
  expect(() => parsePluginCompatibility({ optional: {} }, 'alpha')).toThrow('unknown compatibility field "optional"')
  expect(() => parsePluginCompatibility({ requires: { beta: 'not a range' } }, 'alpha')).toThrow('invalid requires range for "beta"')
})

test('reports conflicts, unmet requirements, and active integrations', () => {
  expect(evaluatePluginCompatibility([
    {
      name: 'alpha', version: '1.0.0',
      compatibility: {
        requires: { missing: '*', inactive: '*', newer: '^2' },
        conflicts: { beta: '<2.0.0' },
        integrates: { beta: '^1', inactive: '*' },
      },
    },
    { name: 'beta', version: '1.5.0', compatibility: { ...empty(), conflicts: { alpha: '*' } } },
    { name: 'inactive', version: '1.0.0', compatibility: empty() },
    { name: 'newer', version: '1.0.0', compatibility: empty() },
  ], [
    { name: 'alpha', entryIds: ['alpha-entry'] },
    { name: 'beta', entryIds: ['beta-entry'] },
    { name: 'newer', entryIds: ['newer-entry'] },
  ])).toEqual([{
    kind: 'conflict',
    left: { package: 'alpha', version: '1.0.0', entryIds: ['alpha-entry'] },
    right: { package: 'beta', version: '1.5.0', entryIds: ['beta-entry'] },
    declaredBy: ['alpha', 'beta'],
  }, {
    kind: 'requirement',
    owner: { package: 'alpha', version: '1.0.0', entryIds: ['alpha-entry'] },
    target: { package: 'inactive', range: '*', version: '1.0.0', entryIds: [] },
    reason: 'inactive',
  }, {
    kind: 'requirement',
    owner: { package: 'alpha', version: '1.0.0', entryIds: ['alpha-entry'] },
    target: { package: 'missing', range: '*', version: null, entryIds: [] },
    reason: 'missing',
  }, {
    kind: 'requirement',
    owner: { package: 'alpha', version: '1.0.0', entryIds: ['alpha-entry'] },
    target: { package: 'newer', range: '^2', version: '1.0.0', entryIds: ['newer-entry'] },
    reason: 'version',
  }, {
    kind: 'integration',
    owner: { package: 'alpha', version: '1.0.0', entryIds: ['alpha-entry'] },
    target: { package: 'beta', version: '1.5.0', entryIds: ['beta-entry'] },
    range: '^1',
  }])
})

test('ignores inactive owners, unmatched optional integrations, and self-relations', () => {
  expect(evaluatePluginCompatibility([
    {
      name: 'alpha', version: '1.0.0',
      compatibility: { requires: { alpha: '*' }, conflicts: { beta: '<2' }, integrates: { beta: '^1' } },
    },
    { name: 'beta', version: '2.0.0', compatibility: empty() },
    { name: 'inactive', version: '1.0.0', compatibility: { ...empty(), requires: { missing: '*' } } },
  ], [
    { name: 'alpha', entryIds: [] },
    { name: 'beta', entryIds: [] },
  ])).toEqual([])
})
