import { tsquery } from '@phenomnomnominal/tsquery'
import MagicString from 'magic-string'
import ts from 'typescript'
import { describe, expect, test } from 'vitest'
import type { HarmonySourcePatch } from 'dsh-harmony'
import {
  insertAfter,
  insertBefore,
  removeElement,
  replaceElement,
  replaceStringLiteral,
  transformProps,
  wrapElement,
} from './index.js'

const target = {
  package: '@deepseek-ai/dsh-client-ui-example',
  version: '0.1.0-rc.6',
}

function applyPatch(source: string, patch: HarmonySourcePatch): string {
  const sourceFile = ts.createSourceFile('lib/client.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const nodes = tsquery(sourceFile, patch.select)
  expect(nodes).toHaveLength(patch.expect!)
  const edit = new MagicString(source)
  for (const node of nodes) patch.apply({
    patch: { key: `test/${patch.id}`, owner: 'test' }, node, source, sourceFile, edit, ts,
  })
  return edit.toString()
}

describe('React source patches', () => {
  test('replaces member components and preserves props and key', () => {
    const source = '(0, react_jsx_runtime.jsx)(primitives.BrandWordmark, { compact: true }, "brand")'
    const patch = replaceElement({
      id: 'brand',
      target,
      select: { component: 'BrandWordmark' },
      expect: 1,
      with: { module: 'example-plugin', export: 'CustomBrand' },
    })

    expect(patch.target).toEqual({ ...target, files: ['lib/client.js'] })
    expect(applyPatch(source, patch)).toBe(
      '(0, react_jsx_runtime.jsx)(require("example-plugin")["CustomBrand"], { compact: true }, "brand")',
    )
  })

  test('replaces local components selected by name', () => {
    const source = '(0, react_jsx_runtime.jsx)(ChatNodeSeat, { nodeKey })'
    const patch = replaceElement({
      id: 'chat-node',
      target,
      select: { component: 'ChatNodeSeat' },
      expect: 1,
      with: { module: 'example-plugin', export: 'ChatNode' },
    })

    expect(applyPatch(source, patch)).toContain(
      '(require("example-plugin")["ChatNode"], { nodeKey })',
    )
  })

  test('wraps an intrinsic element with the original element as children', () => {
    const source = '(0, react_jsx_runtime.jsx)("button", { type: "button" }, item.id)'
    const patch = wrapElement({
      id: 'button-boundary',
      target,
      select: { intrinsic: 'button' },
      expect: 1,
      with: { module: 'example-plugin', export: 'ButtonBoundary' },
    })

    expect(applyPatch(source, patch)).toBe(
      '(0, react_jsx_runtime.jsx)(require("example-plugin")["ButtonBoundary"], { children: '
      + '(0, react_jsx_runtime.jsx)("button", { type: "button" }, item.id) }, item.id)',
    )
  })

  test('inserts sibling elements through keyed fragments', () => {
    const source = '(0, react_jsx_runtime.jsx)(ChatNode, { node }, node.id)'
    const before = insertBefore({
      id: 'before-chat-node',
      target,
      select: { component: 'ChatNode' },
      expect: 1,
      insert: { module: 'example-plugin', export: 'BeforeNode' },
    })
    const after = insertAfter({
      id: 'after-chat-node',
      target,
      select: { component: 'ChatNode' },
      expect: 1,
      insert: { module: 'example-plugin', export: 'AfterNode' },
    })

    expect(applyPatch(source, before)).toBe(
      '(0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: ['
      + '(0, react_jsx_runtime.jsx)(require("example-plugin")["BeforeNode"], {}), '
      + '(0, react_jsx_runtime.jsx)(ChatNode, { node }, node.id)] }, node.id)',
    )
    expect(applyPatch(source, after)).toBe(
      '(0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: ['
      + '(0, react_jsx_runtime.jsx)(ChatNode, { node }, node.id), '
      + '(0, react_jsx_runtime.jsx)(require("example-plugin")["AfterNode"], {})] }, node.id)',
    )
  })

  test('transforms props in the browser and removes elements', () => {
    const source = '(0, react_jsx_runtime.jsxs)(Composer, { children: [left, right] })'
    const propsPatch = transformProps({
      id: 'composer-props',
      target,
      select: { component: 'Composer' },
      expect: 1,
      transform: { module: 'example-plugin', export: 'composerProps' },
    })
    const removePatch = removeElement({
      id: 'remove-composer',
      target,
      select: { component: 'Composer' },
      expect: 1,
    })

    expect(applyPatch(source, propsPatch)).toBe(
      '(0, react_jsx_runtime.jsxs)(Composer, require("example-plugin")["composerProps"]({ children: [left, right] }))',
    )
    expect(applyPatch(source, removePatch)).toBe('null')
  })

  test('accepts a raw TSQuery that directly selects a JSX call', () => {
    const source = '(0, react_jsx_runtime.jsx)(primitives.BrandWordmark, {})'
    const patch = wrapElement({
      id: 'raw-selector',
      target,
      select: { tsquery: 'CallExpression[arguments.0.name.name="BrandWordmark"]' },
      expect: 1,
      with: { module: 'example-plugin', export: 'Boundary' },
    })

    expect(applyPatch(source, patch)).toContain('{ children: (0, react_jsx_runtime.jsx)(primitives.BrandWordmark, {}) }')
  })

  test('replaces exact string literals without claiming they are visible text', () => {
    const source = 'const route = "/internal/path"'
    const patch = replaceStringLiteral({
      id: 'internal-route',
      target,
      text: '/internal/path',
      with: '/replacement/path',
      expect: 1,
    })

    expect(applyPatch(source, patch)).toBe('const route = "/replacement/path"')
  })

  test('requires raw selectors to match the JSX call itself', () => {
    const source = '(0, react_jsx_runtime.jsx)(Card, { title: "one", label: "two" })'
    const patch = wrapElement({
      id: 'raw-leaves',
      target,
      select: { tsquery: 'StringLiteral' },
      expect: 2,
      with: { module: 'example-plugin', export: 'Boundary' },
    })

    expect(() => applyPatch(source, patch)).toThrow(
      'selector must directly match a compiled jsx/jsxs call',
    )
  })

  test('rejects overlapping edits from nested matched elements', () => {
    const source = '(0, react_jsx_runtime.jsx)(Card, { children: (0, react_jsx_runtime.jsx)(Card, {}) })'
    const patch = wrapElement({
      id: 'nested-cards',
      target,
      select: { component: 'Card' },
      expect: 2,
      with: { module: 'example-plugin', export: 'Boundary' },
    })

    expect(() => applyPatch(source, patch)).toThrow(
      'selector resolved to overlapping source ranges',
    )
  })

  test('rejects invalid declarations before Harmony loads them', () => {
    expect(() => removeElement({
      id: '',
      target,
      select: { component: 'Composer' },
      expect: 1,
    })).toThrow('id must not be empty')

    expect(() => removeElement({
      id: 'invalid-expect',
      target,
      select: { component: 'Composer' },
      expect: -1,
    })).toThrow('expect must be a non-negative integer')
  })
})
