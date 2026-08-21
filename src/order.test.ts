import { expect, test } from 'vitest'
import {
  autoSortOrder,
  autoSortPatchOrder,
  orderViolations,
  patchOrderViolations,
  type HarmonyPatchOrderItem,
  type HarmonyProvider,
} from './order.js'

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

test('auto sort returns an exact minimum for a small cyclic component', () => {
  const providers: HarmonyProvider[] = [
    { name: 'a', before: ['b'], after: [] },
    { name: 'b', before: ['c'], after: [] },
    { name: 'c', before: ['a'], after: [] },
  ]

  const order = autoSortOrder(['a', 'b', 'c'], providers)

  expect(orderViolations(order, providers)).toHaveLength(1)
  expect(order).toEqual(['a', 'b', 'c'])
})

test('auto sort handles a large cyclic component without exponential search', () => {
  const names = Array.from({ length: 100 }, (_, index) => `provider-${index}`)
  const providers = names.map((name, index): HarmonyProvider => ({
    name,
    before: [names[(index + 1) % names.length]!],
    after: [],
  }))

  const order = autoSortOrder(names, providers)

  expect(order).toEqual(names)
  expect(orderViolations(order, providers)).toHaveLength(1)
})

test('auto sort keeps unrelated providers stable around a cyclic component', () => {
  const providers: HarmonyProvider[] = [
    { name: 'a', before: ['b'], after: [] },
    { name: 'b', before: ['c'], after: [] },
    { name: 'c', before: ['a'], after: [] },
    { name: 'unrelated', before: [], after: [] },
  ]

  const order = autoSortOrder(['a', 'unrelated', 'b', 'c'], providers)

  expect(order).toEqual(['a', 'unrelated', 'b', 'c'])
  expect(orderViolations(order, providers)).toHaveLength(1)
})

test('Patch declarations override their provider-wide ordering rule', () => {
  const providers: HarmonyProvider[] = [
    { name: 'a', before: ['b'], after: [] },
    { name: 'b', before: [], after: [] },
  ]
  const patches: HarmonyPatchOrderItem[] = [
    { key: 'a/default', owner: 'a', index: 0 },
    { key: 'a/override', owner: 'a', index: 1, after: ['b'] },
    { key: 'b/first', owner: 'b', index: 0 },
    { key: 'b/second', owner: 'b', index: 1 },
  ]

  const order = autoSortPatchOrder(patches.map(patch => patch.key), patches, providers)

  expect(order).toEqual(['a/default', 'b/first', 'b/second', 'a/override'])
  expect(patchOrderViolations(order, patches, providers)).toEqual([])
})

test('reports developer constraints without changing a user Patch order', () => {
  const providers: HarmonyProvider[] = [
    { name: 'a', before: ['b'], after: [] },
    { name: 'b', before: [], after: [] },
  ]
  const patches: HarmonyPatchOrderItem[] = [
    { key: 'a/patch', owner: 'a', index: 0 },
    { key: 'b/patch', owner: 'b', index: 0 },
  ]

  expect(patchOrderViolations(['b/patch', 'a/patch'], patches, providers)).toEqual([{
    before: 'a/patch', after: 'b/patch', declaredBy: 'a',
  }])
})
