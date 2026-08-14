import { expect, test } from 'vitest'
import { autoSortOrder, orderViolations, type HarmonyProvider } from './order.js'

test('auto sort satisfies every acyclic before and after declaration', () => {
  const providers: HarmonyProvider[] = [
    { name: 'weather', before: [], after: ['framework'] },
    { name: 'framework', before: ['ui'], after: [] },
    { name: 'ui', before: [], after: [] },
  ]

  const order = autoSortOrder(['ui', 'weather', 'framework'], providers)

  expect(orderViolations(order, providers)).toEqual([])
  expect(order).toEqual(['framework', 'ui', 'weather'])
})

test('auto sort returns an exact minimum for a cyclic component', () => {
  const providers: HarmonyProvider[] = [
    { name: 'a', before: ['b'], after: [] },
    { name: 'b', before: ['c'], after: [] },
    { name: 'c', before: ['a'], after: [] },
  ]

  const order = autoSortOrder(['a', 'b', 'c'], providers)

  expect(orderViolations(order, providers)).toHaveLength(1)
  expect(order).toEqual(['a', 'b', 'c'])
})
