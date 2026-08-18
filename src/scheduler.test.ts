import { expect, test } from 'vitest'
import { schedulePatchBatches } from './scheduler.js'

test('slices global Patch order per file and releases independent heads together', () => {
  expect(schedulePatchBatches([
    { key: 'a', files: ['one.js'] },
    { key: 'b', files: ['two.js'] },
    { key: 'barrier', files: ['one.js', 'two.js'] },
    { key: 'c', files: ['one.js'] },
    { key: 'd', files: ['three.js'] },
  ])).toEqual([
    ['a', 'b', 'd'],
    ['barrier'],
    ['c'],
  ])
})

test('keeps each file slice in global Patch order', () => {
  const items = [
    { key: 'first', files: ['a.js', 'b.js'] },
    { key: 'middle', files: ['a.js'] },
    { key: 'last', files: ['a.js', 'b.js'] },
  ]

  expect(schedulePatchBatches(items)).toEqual([['first'], ['middle'], ['last']])
})
