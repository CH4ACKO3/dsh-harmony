import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { tsquery } from '@phenomnomnominal/tsquery'
import MagicString from 'magic-string'
import ts from 'typescript'
import { describe, expect, test } from 'vitest'
import type { HarmonySourcePatch } from 'dsh-harmony'
import * as api from './index.js'
import { component, element } from './index.js'

const require = createRequire(import.meta.url)

const target = {
  package: '@deepseek-ai/dsh-client-ui-example',
  version: '0.1.0-rc.8',
  file: 'lib/client.js',
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

function applyPatches(source: string, patches: HarmonySourcePatch[]): string {
  return patches.reduce(applyPatch, source)
}

describe('React source patches', () => {
  test('uses the current core workspace during development', () => {
    const resolvedCore = dirname(require.resolve('dsh-harmony/package.json'))
    expect(realpathSync(resolvedCore)).toBe(realpathSync(new URL('../../..', import.meta.url)))
  })

  test('exports only the element and component patch factories', () => {
    expect(Object.keys(api).sort()).toEqual(['component', 'element'])
  })

  test('replaces an element component while preserving props and key', () => {
    const source = '(0, react_jsx_runtime.jsx)(primitives.BrandWordmark, { compact: true }, "brand")'
    const patch = element({
      id: 'brand',
      description: 'Replaces the built-in brand mark.',
      target,
      select: { component: 'BrandWordmark' },
      expect: 1,
      before: ['late-provider'],
      operation: {
        kind: 'replace',
        with: { module: 'example-plugin', export: 'CustomBrand' },
      },
    })

    expect(patch.target).toEqual(target)
    expect(patch.description).toBe('Replaces the built-in brand mark.')
    expect(patch.before).toEqual(['late-provider'])
    expect(applyPatch(source, patch)).toBe(
      '(0, react_jsx_runtime.jsx)(require("example-plugin")["CustomBrand"], { compact: true }, "brand")',
    )
  })

  test('selects local element components by name', () => {
    const source = '(0, react_jsx_runtime.jsx)(ChatNodeSeat, { nodeKey })'
    const patch = element({
      id: 'chat-node',
      target,
      select: { component: 'ChatNodeSeat' },
      expect: 1,
      operation: {
        kind: 'replace',
        with: { module: 'example-plugin', export: 'ChatNode' },
      },
    })

    expect(applyPatch(source, patch)).toContain(
      '(require("example-plugin")["ChatNode"], { nodeKey })',
    )
  })

  test('wraps an intrinsic element with the original element as children', () => {
    const source = '(0, react_jsx_runtime.jsx)("button", { type: "button" }, item.id)'
    const patch = element({
      id: 'button-boundary',
      target,
      select: { intrinsic: 'button' },
      expect: 1,
      operation: {
        kind: 'wrap',
        with: { module: 'example-plugin', export: 'ButtonBoundary' },
      },
    })

    expect(applyPatch(source, patch)).toBe(
      '(0, react_jsx_runtime.jsx)(require("example-plugin")["ButtonBoundary"], { children: '
      + '(0, react_jsx_runtime.jsx)("button", { type: "button" }, item.id) }, item.id)',
    )
  })

  test('inserts sibling elements through keyed fragments', () => {
    const source = '(0, react_jsx_runtime.jsx)(ChatNode, { node }, node.id)'
    const before = element({
      id: 'before-chat-node',
      target,
      select: { component: 'ChatNode' },
      expect: 1,
      operation: {
        kind: 'insert-before',
        with: { module: 'example-plugin', export: 'BeforeNode' },
      },
    })
    const after = element({
      id: 'after-chat-node',
      target,
      select: { component: 'ChatNode' },
      expect: 1,
      operation: {
        kind: 'insert-after',
        with: { module: 'example-plugin', export: 'AfterNode' },
      },
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

  test('transforms props in order and removes elements', () => {
    const source = '(0, react_jsx_runtime.jsxs)(Composer, { children: [left, right] })'
    const first = element({
      id: 'composer-props-a',
      target,
      select: { component: 'Composer' },
      expect: 1,
      operation: {
        kind: 'transform-props',
        with: { module: 'example-plugin', export: 'firstProps' },
      },
    })
    const second = element({
      id: 'composer-props-b',
      target,
      select: { component: 'Composer' },
      expect: 1,
      operation: {
        kind: 'transform-props',
        with: { module: 'example-plugin', export: 'secondProps' },
      },
    })
    const remove = element({
      id: 'remove-composer',
      target,
      select: { component: 'Composer' },
      expect: 1,
      operation: { kind: 'remove' },
    })

    expect(applyPatches(source, [first, second])).toBe(
      '(0, react_jsx_runtime.jsxs)(Composer, require("example-plugin")["secondProps"]('
      + 'require("example-plugin")["firstProps"]({ children: [left, right] })))',
    )
    expect(applyPatch(source, remove)).toBe('null')
  })

  test('decorates a component binding once for every use and composes in patch order', () => {
    const source = [
      'const Button = props => (0, react_jsx_runtime.jsx)("button", props);',
      'const first = (0, react_jsx_runtime.jsx)(Button, { id: "first" });',
      'const second = (0, react_jsx_runtime.jsx)(Button, { id: "second" });',
    ].join('\n')
    const first = component({
      id: 'button-feature-a',
      target,
      select: { name: 'Button' },
      expect: 1,
      operation: {
        kind: 'decorate',
        with: { module: 'example-plugin', export: 'withFirstFeature' },
      },
    })
    const second = component({
      id: 'button-feature-b',
      target,
      select: { name: 'Button' },
      expect: 1,
      operation: {
        kind: 'decorate',
        with: { module: 'example-plugin', export: 'withSecondFeature' },
      },
    })

    expect(first.trace).toEqual({
      select: expect.stringContaining('arguments.0.name="Button"'),
      effect: 'decorate-component',
      maxMatches: Number.MAX_SAFE_INTEGER,
    })
    const transformed = applyPatches(source, [first, second])
    expect(transformed).toBe([
      'const Button = require("example-plugin")["withSecondFeature"]('
      + 'require("example-plugin")["withFirstFeature"](props => (0, react_jsx_runtime.jsx)("button", props)));',
      'const first = (0, react_jsx_runtime.jsx)(Button, { id: "first" });',
      'const second = (0, react_jsx_runtime.jsx)(Button, { id: "second" });',
    ].join('\n'))
    const tracedSource = ts.createSourceFile('lib/client.js', transformed, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    expect(tsquery(tracedSource, first.trace!.select)).toHaveLength(2)
    expect(second.trace?.effect).toBe('decorate-component')
  })

  test('decorates a named function component and keeps later component patches composable', () => {
    const source = [
      'function HeroShell(props) { return (0, runtime.jsx)("main", props) }',
      'const view = (0, runtime.jsx)(HeroShell, { id: "hero" });',
    ].join('\n')
    const first = component({
      id: 'hero-feature-a',
      target,
      select: { name: 'HeroShell' },
      expect: 1,
      operation: {
        kind: 'decorate',
        with: { module: 'example-plugin', export: 'withFirstFeature' },
      },
    })
    const second = component({
      id: 'hero-feature-b',
      target,
      select: { name: 'HeroShell' },
      expect: 1,
      operation: {
        kind: 'decorate',
        with: { module: 'example-plugin', export: 'withSecondFeature' },
      },
    })

    expect(applyPatches(source, [first, second])).toBe([
      'const HeroShell = require("example-plugin")["withSecondFeature"]('
      + 'require("example-plugin")["withFirstFeature"]('
      + 'function HeroShell(props) { return (0, runtime.jsx)("main", props) }));',
      'const view = (0, runtime.jsx)(HeroShell, { id: "hero" });',
    ].join('\n'))
  })

  test('replaces exported function components without leaving the original implementation active', () => {
    const named = component({
      id: 'replace-named-function',
      target,
      select: { name: 'HeroShell' },
      expect: 1,
      operation: {
        kind: 'replace',
        with: { module: 'example-plugin', export: 'HeroShell' },
      },
    })
    const defaultExport = component({
      id: 'replace-default-function',
      target,
      select: { name: 'DefaultShell' },
      expect: 1,
      operation: {
        kind: 'replace',
        with: { module: 'example-plugin', export: 'DefaultShell' },
      },
    })

    expect(applyPatch('export function HeroShell() { return oldView }', named)).toBe(
      'export const HeroShell = require("example-plugin")["HeroShell"];',
    )
    expect(named.trace?.effect).toBe('replace-component')
    expect(applyPatch('export default function DefaultShell() { return oldView }', defaultExport)).toBe(
      'const DefaultShell = require("example-plugin")["DefaultShell"];\nexport default DefaultShell;',
    )
  })

  test('replaces a component binding without rewriting its call sites', () => {
    const source = 'const Button = originalButton; const view = (0, runtime.jsx)(Button, {})'
    const patch = component({
      id: 'replace-button',
      target,
      select: { name: 'Button' },
      expect: 1,
      after: ['base-provider'],
      operation: {
        kind: 'replace',
        with: { module: 'example-plugin', export: 'Button' },
      },
    })

    expect(patch.after).toEqual(['base-provider'])
    expect(applyPatch(source, patch)).toBe(
      'const Button = require("example-plugin")["Button"]; const view = (0, runtime.jsx)(Button, {})',
    )
  })

  test('accepts raw selectors for elements and component bindings', () => {
    const elementPatch = element({
      id: 'raw-element',
      target,
      select: { tsquery: 'CallExpression[arguments.0.name.name="BrandWordmark"]' },
      expect: 1,
      operation: {
        kind: 'wrap',
        with: { module: 'example-plugin', export: 'Boundary' },
      },
    })
    const componentPatch = component({
      id: 'raw-component',
      target,
      select: { tsquery: 'VariableDeclaration[name.name="Card"]' },
      expect: 1,
      operation: {
        kind: 'decorate',
        with: { module: 'example-plugin', export: 'withCard' },
      },
    })

    expect(applyPatch('(0, runtime.jsx)(primitives.BrandWordmark, {})', elementPatch)).toContain(
      '{ children: (0, runtime.jsx)(primitives.BrandWordmark, {}) }',
    )
    expect(applyPatch('const Card = makeCard()', componentPatch)).toBe(
      'const Card = require("example-plugin")["withCard"](makeCard())',
    )
  })

  test('accepts a raw function declaration selector for components', () => {
    const patch = component({
      id: 'function-declaration',
      target,
      select: { tsquery: 'FunctionDeclaration[name.name="Card"]' },
      expect: 1,
      operation: {
        kind: 'decorate',
        with: { module: 'example-plugin', export: 'withCard' },
      },
    })

    expect(applyPatch('function Card() {}', patch)).toBe(
      'const Card = require("example-plugin")["withCard"](function Card() {});',
    )
    expect(patch.trace).toBeUndefined()
  })

  test('requires selectors to match their abstraction directly', () => {
    const elementPatch = element({
      id: 'raw-leaves',
      target,
      select: { tsquery: 'StringLiteral' },
      expect: 2,
      operation: {
        kind: 'wrap',
        with: { module: 'example-plugin', export: 'Boundary' },
      },
    })
    const componentPatch = component({
      id: 'function-body',
      target,
      select: { tsquery: 'Block' },
      expect: 1,
      operation: {
        kind: 'decorate',
        with: { module: 'example-plugin', export: 'withCard' },
      },
    })

    expect(() => applyPatch('(0, runtime.jsx)(Card, { title: "one", label: "two" })', elementPatch)).toThrow(
      'element selector must directly match a compiled jsx/jsxs call',
    )
    expect(() => applyPatch('function Card() {}', componentPatch)).toThrow(
      'component selector must directly match an initialized variable declaration or a named function declaration with a body',
    )
  })

  test('rejects overlapping edits from nested matched elements', () => {
    const source = '(0, runtime.jsx)(Card, { children: (0, runtime.jsx)(Card, {}) })'
    const patch = element({
      id: 'nested-cards',
      target,
      select: { component: 'Card' },
      expect: 2,
      operation: {
        kind: 'wrap',
        with: { module: 'example-plugin', export: 'Boundary' },
      },
    })

    expect(() => applyPatch(source, patch)).toThrow('selector resolved to overlapping source ranges')
  })

  test('rejects invalid declarations before Harmony loads them', () => {
    expect(() => element({
      id: '',
      target,
      select: { component: 'Composer' },
      expect: 1,
      operation: { kind: 'remove' },
    })).toThrow('id must not be empty')

    expect(() => element({
      id: 'missing-file',
      target: { ...target, file: '' },
      select: { component: 'Composer' },
      expect: 1,
      operation: { kind: 'remove' },
    })).toThrow('target.file must not be empty')

    expect(() => element({
      id: 'invalid-expect',
      target,
      select: { component: 'Composer' },
      expect: -1,
      operation: { kind: 'remove' },
    })).toThrow('expect must be a non-negative integer')

    expect(() => element({
      id: 'invalid-element-operation',
      target,
      select: { component: 'Composer' },
      expect: 1,
      operation: { kind: 'unknown' } as never,
    })).toThrow('unknown element operation')

    expect(() => component({
      id: 'invalid-component-operation',
      target,
      select: { name: 'Composer' },
      expect: 1,
      operation: { kind: 'unknown' } as never,
    })).toThrow('unknown component operation')
  })
})
