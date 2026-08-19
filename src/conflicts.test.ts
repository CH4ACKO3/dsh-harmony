import { expect, test } from 'vitest'
import { evaluatePluginConflicts, parsePluginConflicts } from './conflicts.js'

test('parses package conflict ranges strictly', () => {
  expect(parsePluginConflicts({ beta: '*', gamma: '<2' }, 'alpha')).toEqual({ beta: '*', gamma: '<2' })
  expect(parsePluginConflicts(undefined, 'alpha')).toEqual({})
  expect(() => parsePluginConflicts(['beta'], 'alpha')).toThrow('dsh.plugin.conflicts must be an object')
  expect(() => parsePluginConflicts({ beta: 'not a range' }, 'alpha')).toThrow('invalid conflict range for "beta"')
})

test('matches active package versions and deduplicates two-sided declarations', () => {
  expect(evaluatePluginConflicts([
    { name: 'alpha', version: '1.0.0', conflicts: { beta: '<2.0.0', inactive: '*' } },
    { name: 'beta', version: '1.5.0', conflicts: { alpha: '*' } },
    { name: 'inactive', version: '1.0.0', conflicts: {} },
  ], [
    { name: 'alpha', entryIds: ['alpha-entry'] },
    { name: 'beta', entryIds: ['beta-one', 'beta-two'] },
  ])).toEqual([{
    left: { package: 'alpha', version: '1.0.0', entryIds: ['alpha-entry'] },
    right: { package: 'beta', version: '1.5.0', entryIds: ['beta-one', 'beta-two'] },
    declaredBy: ['alpha', 'beta'],
  }])
})

test('ignores unmatched versions, inactive packages, and self-conflicts', () => {
  expect(evaluatePluginConflicts([
    { name: 'alpha', version: '1.0.0', conflicts: { alpha: '*', beta: '<2', gamma: '*' } },
    { name: 'beta', version: '2.0.0', conflicts: {} },
    { name: 'gamma', version: '1.0.0', conflicts: {} },
  ], [
    { name: 'alpha', entryIds: [] },
    { name: 'beta', entryIds: [] },
  ])).toEqual([])
})
