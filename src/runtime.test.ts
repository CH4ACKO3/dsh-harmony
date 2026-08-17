import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, test } from 'vitest'
import {
  beginProfileUpdate,
  beginPluginUpdate,
  currentProfile,
  discoverPackage,
  getPatchInspections,
  getPatchStatuses,
  inspectPatchTargets,
  inspectPatchDependencies,
  installFileTransforms,
  retainedGenerationCount,
  subscribePatchStatuses,
  synchronizePluginOrder,
  synchronizeProfile,
  watchProfile,
} from './runtime.js'
import { apply as applyHarmonyPlugin, reloadEntries } from './plugin.js'

const root = mkdtempSync(join(tmpdir(), 'dsh-harmony-'))
const WATCH_READY_DELAY = 750
const active = process.env.DSH_HARMONY_ACTIVE
beforeAll(() => {
  process.env.DSH_HARMONY_ACTIVE = '1'
  installFileTransforms()
})
afterAll(() => {
  if (active === undefined) delete process.env.DSH_HARMONY_ACTIVE
  else process.env.DSH_HARMONY_ACTIVE = active
  rmSync(root, { recursive: true })
})

test('preserves binary files byte for byte', async () => {
  const filename = join(root, 'session.jsonl.zstd')
  const source = Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 0x80, 0xff, 0x00, 0x61])
  writeFileSync(filename, source)

  expect(readFileSync(filename)).toEqual(source)
  expect(await readFile(filename)).toEqual(source)
})

test('preserves non-UTF encodings when reading JavaScript', async () => {
  const target = join(root, 'encoded-target')
  const provider = join(root, 'encoded-provider')
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(provider)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'encoded-target' }))
  const filename = join(target, 'lib/index.js')
  const source = 'export const value = 1\n'
  writeFileSync(filename, source)
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'encoded-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'test-patch',
  target: { package: 'encoded-target', files: ['lib/index.js'] },
  select: 'NumericLiteral',
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '2') },
}
`)
  discoverPackage(provider)

  expect(readFileSync(filename, 'base64')).toBe(Buffer.from(source).toString('base64'))
  expect(readFileSync(filename, 'hex')).toBe(Buffer.from(source).toString('hex'))
  expect(await readFile(filename, 'base64')).toBe(Buffer.from(source).toString('base64'))
  expect(await readFile(filename, 'hex')).toBe(Buffer.from(source).toString('hex'))
})

test('applies a declared patch while reading a plugin file', async () => {
  const target = join(root, 'target')
  const provider = join(root, 'provider')
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(provider)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'target-plugin', type: 'module' }))
  writeFileSync(join(target, 'lib/index.js'), 'export function answer() { return 1 }\n')
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'patch-provider',
    dsh: { harmony: { patches: ['./answer.patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'answer.patch.cjs'), `
module.exports = {
  id: 'test-patch',
  target: { package: 'target-plugin', files: ['lib/index.js'] },
  select: 'NumericLiteral[text="1"]',
  apply({ node, sourceFile, edit }) {
    edit.overwrite(node.getStart(sourceFile), node.getEnd(), '2')
  },
}
`)

  discoverPackage(provider)

  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('return 2')
  expect(await readFile(join(target, 'lib/index.js'), 'utf8')).toContain('return 2')
})

test('skips a Patch with the wrong match count and continues applying later Patches', () => {
  const target = join(root, 'expect-target')
  const provider = join(root, 'expect-provider')
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(provider)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'expect-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const values = [1, 2]\n')
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'expect-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = [{
  id: 'one-number',
  target: { package: 'expect-target', files: ['lib/index.js'] },
  select: 'NumericLiteral',
  expect: 1,
  apply() {},
}, {
  id: 'replace-two',
  target: { package: 'expect-target', files: ['lib/index.js'] },
  select: 'NumericLiteral[text="2"]',
  expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '3') },
}]
`)
  discoverPackage(provider)

  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('[1, 3]')
  expect(getPatchStatuses().find(patch => patch.key === 'expect-provider/one-number')).toMatchObject({
    state: 'failed',
    matches: 2,
    file: 'lib/index.js',
  })
  expect(getPatchStatuses().find(patch => patch.key === 'expect-provider/replace-two')?.state).toBe('bound')
})

test('collects failed statuses without aborting the status inspection pass', () => {
  const profile = join(root, 'status-profile')
  const provider = join(profile, 'node_modules', 'status-provider')
  const target = join(profile, 'node_modules', 'status-target')
  mkdirSync(provider, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'status-provider': '1', 'status-target': '1' },
  }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'status-provider', version: '1.0.0', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = [{
  id: 'wrong-count', target: { package: 'status-target', files: ['lib/index.js'] },
  select: 'NumericLiteral', expect: 1, apply() {},
}, {
  id: 'missing-file', target: { package: 'status-target', files: ['lib/missing.js'] },
  select: 'SourceFile', apply() {},
}, {
  id: 'missing-package', target: { package: 'status-target-absent', files: ['lib/index.js'] },
  select: 'SourceFile', apply() {},
}]
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'status-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const values = [1, 2]\n')
  synchronizeProfile(profile)

  expect(() => inspectPatchTargets(true)).not.toThrow()
  expect(getPatchStatuses().find(patch => patch.key === 'status-provider/wrong-count')).toMatchObject({
    state: 'failed', matches: 2,
  })
  expect(getPatchStatuses().find(patch => patch.key === 'status-provider/missing-file')).toMatchObject({
    state: 'failed', matches: 0,
  })
  expect(getPatchStatuses().find(patch => patch.key === 'status-provider/missing-package')).toMatchObject({
    state: 'failed', matches: 0, loaded: false,
  })
})

test('reports lazy Patch failures only after their generation is committed', () => {
  const profile = join(root, 'lazy-failure-profile')
  const provider = join(profile, 'node_modules', 'lazy-failure-provider')
  const target = join(profile, 'node_modules', 'lazy-failure-target')
  mkdirSync(provider, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'lazy-failure-provider': '1', 'lazy-failure-target': '1' },
  }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'lazy-failure-provider', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'wrong-count', target: { package: 'lazy-failure-target', files: ['lib/index.js'] },
  select: 'NumericLiteral', expect: 1, apply() {},
}
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'lazy-failure-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const values = [1, 2]\n')
  synchronizeProfile(profile)

  let changes = 0
  const stop = subscribePatchStatuses(() => { changes += 1 })
  const rolledBack = beginPluginUpdate(['lazy-failure-provider', 'lazy-failure-target'], true)
  readFileSync(join(target, 'lib/index.js'), 'utf8')
  expect(changes).toBe(0)
  rolledBack.rollback()

  const committed = beginPluginUpdate(['lazy-failure-provider', 'lazy-failure-target'], true)
  committed.commit()
  readFileSync(join(target, 'lib/index.js'), 'utf8')
  expect(changes).toBe(1)
  readFileSync(join(target, 'lib/index.js'), 'utf8')
  expect(changes).toBe(1)
  stop()
})

test('uses target version ranges and the first existing candidate file', () => {
  const target = join(root, 'version-target')
  const provider = join(root, 'version-provider')
  mkdirSync(join(target, 'dist'), { recursive: true })
  mkdirSync(provider)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'version-target', version: '2.3.0' }))
  writeFileSync(join(target, 'dist/index.js'), 'export const value = 1\n')
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'version-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'versioned',
  target: { package: 'version-target', version: '^2.0.0', files: ['lib/index.js', 'dist/index.js'] },
  select: 'NumericLiteral',
  expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '2') },
}
`)
  discoverPackage(provider)

  expect(readFileSync(join(target, 'dist/index.js'), 'utf8')).toContain('value = 2')
  expect(getPatchStatuses().find(patch => patch.key === 'version-provider/versioned')).toMatchObject({
    state: 'bound', matches: 1, file: 'dist/index.js',
  })

  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'version-target', version: '3.0.0' }))
  writeFileSync(join(target, 'dist/index.js'), 'export const value = 3\n')
  expect(readFileSync(join(target, 'dist/index.js'), 'utf8')).toContain('value = 3')
  expect(getPatchStatuses().find(patch => patch.key === 'version-provider/versioned')).toMatchObject({
    state: 'failed', matches: 0,
  })
})

test('composes semantic before, around and after patches for sync and async functions', async () => {
  const target = join(root, 'semantic-target')
  const provider = join(root, 'semantic-provider')
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(provider)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'semantic-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), `
function answer(value) { return value * 2 }
async function delayed(value) { return value + 1 }
function defaulted(value = 7) { return value }
module.exports = { answer, delayed, defaulted }
`)
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'semantic-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = [{
  id: 'answer-before',
  target: { package: 'semantic-target', files: ['lib/index.js'], function: 'answer' },
  operation: 'before',
  handler({ args }) { return [args[0] + 1] },
}, {
  id: 'answer-around',
  target: { package: 'semantic-target', files: ['lib/index.js'], function: 'answer' },
  operation: 'around',
  handler({ args, invoke }) { return invoke([args[0] + 1]) },
}, {
  id: 'answer-after',
  target: { package: 'semantic-target', files: ['lib/index.js'], function: 'answer' },
  operation: 'after',
  handler({ result }) { return result + 1 },
}, {
  id: 'delayed-after',
  target: { package: 'semantic-target', files: ['lib/index.js'], function: 'delayed' },
  operation: 'after',
  async handler({ result }) { return result * 3 },
}, {
  id: 'defaulted-after',
  target: { package: 'semantic-target', files: ['lib/index.js'], function: 'defaulted' },
  operation: 'after',
  handler({ result }) { return result },
}]
`)
  discoverPackage(provider)
  const transformed = readFileSync(join(target, 'lib/index.js'), 'utf8')
  const module = { exports: {} as any }
  new Function('module', 'exports', transformed)(module, module.exports)

  expect(module.exports.answer(1)).toBe(7)
  await expect(module.exports.delayed(2)).resolves.toBe(9)
  expect(module.exports.defaulted()).toBe(7)
  expect(getPatchStatuses().filter(patch => patch.owner === 'semantic-provider').every(patch => patch.state === 'bound')).toBe(true)
  expect(getPatchInspections('semantic-target', 'lib/index.js')[0]?.steps).toHaveLength(5)
})

test('preserves semantic declaration order, arguments, and local identifiers', () => {
  const target = join(root, 'semantic-order-target')
  const provider = join(root, 'semantic-order-provider')
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(provider)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'semantic-order-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), `
'use strict'
function answer(value) {
  const __dshHarmonyArgs = 2
  const __dshHarmonyIndex = 3
  const __dshHarmonyLength = 4
  return [value, arguments[0], __dshHarmonyArgs, __dshHarmonyIndex, __dshHarmonyLength]
}
module.exports = { answer }
`)
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'semantic-order-provider', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = [{
  id: 'before',
  target: { package: 'semantic-order-target', files: ['lib/index.js'], function: 'answer' },
  operation: 'before',
  handler() { return [5] },
}, {
  id: 'after-a',
  target: { package: 'semantic-order-target', files: ['lib/index.js'], function: 'answer' },
  operation: 'after',
  handler({ result }) { result.push('A'); return result },
}, {
  id: 'after-b',
  target: { package: 'semantic-order-target', files: ['lib/index.js'], function: 'answer' },
  operation: 'after',
  handler({ result }) { result.push('B'); return result },
}]
`)
  discoverPackage(provider)
  const transformed = readFileSync(join(target, 'lib/index.js'), 'utf8')
  const module = { exports: {} as any }
  new Function('module', 'exports', transformed)(module, module.exports)

  expect(module.exports.answer(1)).toEqual([5, 5, 2, 3, 4, 'A', 'B'])
})

test('applies source and semantic patches in one global declaration order', () => {
  const target = join(root, 'mixed-order-target')
  const provider = join(root, 'mixed-order-provider')
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(provider)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'mixed-order-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'function answer() { return 1 }\n')
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'mixed-order-provider', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = [{
  id: 'semantic-first',
  target: { package: 'mixed-order-target', files: ['lib/index.js'], function: 'answer' },
  operation: 'after',
  handler({ result }) { return result + 1 },
}, {
  id: 'source-second',
  target: { package: 'mixed-order-target', files: ['lib/index.js'] },
  select: 'PropertyAccessExpression[name.text="__dshHarmonyInvoke"]',
  expect: 1,
  apply() {},
}]
`)
  discoverPackage(provider)

  expect(() => readFileSync(join(target, 'lib/index.js'), 'utf8')).not.toThrow()
  expect(getPatchStatuses().filter(patch => patch.owner === 'mixed-order-provider').every(patch => patch.state === 'bound')).toBe(true)
})

test('detects a Source Patch that only matches after a previous provider', () => {
  const target = join(root, 'differential-target')
  const provider = join(root, 'differential-provider')
  const draft = join(root, 'differential-draft')
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(provider)
  mkdirSync(draft)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'differential-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'differential-provider', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'introduce-call',
  target: { package: 'differential-target', files: ['lib/index.js'] },
  select: 'NumericLiteral[text="1"]', expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), 'provideValue()') },
}
`)
  writeFileSync(join(draft, 'package.json'), JSON.stringify({
    name: 'differential-draft', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(draft, 'patch.cjs'), `
module.exports = {
  id: 'consume-call',
  target: { package: 'differential-target', files: ['lib/index.js'] },
  select: 'CallExpression[expression.text="provideValue"]', expect: 1,
  apply() {},
}
`)
  discoverPackage(provider)
  discoverPackage(draft)

  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('provideValue()')
  expect(inspectPatchDependencies('differential-draft')).toEqual([expect.objectContaining({
    patch: 'differential-draft/consume-call',
    providerCandidates: ['differential-provider'],
    target: { package: 'differential-target', file: 'lib/index.js' },
  })])
})

test('adds React provenance only after every business patch has composed', () => {
  const target = join(root, 'trace-target')
  const provider = join(root, 'trace-provider')
  const external = join(root, 'trace-external-provider')
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(provider)
  mkdirSync(external)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'trace-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/client.js'), 'const r={jsx(type,props,key){return {type,props,key}}};module.exports=(0,r.jsx)(Original,{},"stable-key")\n')
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'trace-provider', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = [{
  id: 'replace', target: { package: 'trace-target', files: ['lib/client.js'] },
  select: 'CallExpression[arguments.0.name="Original"]', expect: 1,
  trace: {
    select: 'CallExpression[arguments.0.expression.expression.name="require"][arguments.0.expression.arguments.0.text="plugin-a"][arguments.0.argumentExpression.text="A"]',
    effect: 'replace-element', maxMatches: 1,
  },
  apply({ node, sourceFile, edit }) {
    const type = node.arguments[0]
    edit.overwrite(type.getStart(sourceFile), type.getEnd(), 'require("plugin-a")["A"]')
  },
}, {
  id: 'wrap', target: { package: 'trace-target', files: ['lib/client.js'] },
  select: 'CallExpression[arguments.0.expression.expression.name="require"][arguments.0.expression.arguments.0.text="plugin-a"][arguments.0.argumentExpression.text="A"]', expect: 1,
  trace: {
    select: 'CallExpression[arguments.0.expression.expression.name="require"][arguments.0.expression.arguments.0.text="plugin-b"][arguments.0.argumentExpression.text="B"]',
    effect: 'wrap-element', maxMatches: 1,
  },
  apply({ node, sourceFile, source, edit }) {
    const original = source.slice(node.getStart(sourceFile), node.getEnd())
    edit.overwrite(node.getStart(sourceFile), node.getEnd(), '(0,r.jsx)(require("plugin-b")["B"],{children:' + original + '},"wrapper-key")')
  },
}]
`)
  writeFileSync(join(external, 'package.json'), JSON.stringify({
    name: 'trace-external-provider', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(external, 'patch.cjs'), `
module.exports = {
  id: 'external-props', target: { package: 'trace-target', files: ['lib/client.js'] },
  select: 'CallExpression[arguments.0.expression.expression.name="require"][arguments.0.expression.arguments.0.text="plugin-b"][arguments.0.argumentExpression.text="B"]', expect: 1,
  trace: {
    select: 'CallExpression[arguments.0.expression.expression.name="require"][arguments.0.expression.arguments.0.text="plugin-b"][arguments.0.argumentExpression.text="B"]',
    effect: 'transform-props', maxMatches: 1,
  },
  apply() {},
}
`)
  discoverPackage(provider)
  discoverPackage(external)
  const previous = process.env.DSH_HARMONY_REACT_TRACE
  process.env.DSH_HARMONY_REACT_TRACE = '1'
  try {
    const transformed = readFileSync(join(target, 'lib/client.js'), 'utf8')
    expect(transformed).toContain('__dshHarmonyPatchTrace')
    expect(transformed).toContain('trace-provider/replace')
    expect(transformed).toContain('trace-provider/wrap')
    expect(transformed).toContain('trace-external-provider/external-props')
    const module = { exports: {} as any }
    new Function('module', 'exports', 'Original', 'require', transformed)(
      module,
      module.exports,
      function Original() {},
      (name: string) => function PluginComponent() { return name },
    )
    expect(module.exports.key).toBe('wrapper-key')
    expect(module.exports.props.children.key).toBe('wrapper-key')
    expect(module.exports.props.children.props.children.key).toBe('stable-key')
    const inspection = getPatchInspections('trace-target', 'lib/client.js')[0]!
    expect(inspection.steps).toHaveLength(3)
    expect(inspection.final).not.toContain('__dshHarmonyPatchTrace')
    expect(inspection.final).toContain('require("plugin-b")["B"]')
    expect(getPatchStatuses().find(patch => patch.key === 'trace-provider/wrap')).toMatchObject({
      declaration: 'patch.cjs', file: 'lib/client.js',
    })
  } finally {
    if (previous === undefined) delete process.env.DSH_HARMONY_REACT_TRACE
    else process.env.DSH_HARMONY_REACT_TRACE = previous
  }
})

test('leaves normal Host browser output uninstrumented', () => {
  const target = join(root, 'normal-trace-target')
  const provider = join(root, 'normal-trace-provider')
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(provider)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'normal-trace-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/client.js'), 'module.exports=(0,r.jsx)(Original,{})\n')
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'normal-trace-provider', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'normal-trace', target: { package: 'normal-trace-target', files: ['lib/client.js'] },
  select: 'CallExpression[arguments.0.name="Original"]', expect: 1,
  trace: { select: 'CallExpression[arguments.0.name="Original"]', effect: 'wrap-element', maxMatches: 1 },
  apply({ patch, node, sourceFile, edit }) {
    edit.appendRight(node.getEnd(), '/*' + patch.key + ':' + patch.owner + '*/')
  },
}
`)
  discoverPackage(provider)
  const previous = process.env.DSH_HARMONY_REACT_TRACE
  delete process.env.DSH_HARMONY_REACT_TRACE
  try {
    const transformed = readFileSync(join(target, 'lib/client.js'), 'utf8')
    expect(transformed).toContain('normal-trace-provider/normal-trace:normal-trace-provider')
    expect(transformed).not.toContain('__dshHarmonyPatchTrace')
  } finally {
    if (previous !== undefined) process.env.DSH_HARMONY_REACT_TRACE = previous
  }
})

test('keeps old semantic bindings unchanged while a candidate transaction is pending', () => {
  const profile = join(root, 'semantic-isolation-profile')
  const provider = join(profile, 'node_modules', 'semantic-isolation-provider')
  const target = join(profile, 'node_modules', 'semantic-isolation-target')
  mkdirSync(provider, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'semantic-isolation-provider': '1', 'semantic-isolation-target': '1' },
  }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'semantic-isolation-provider', version: '1.0.0', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'after',
  target: { package: 'semantic-isolation-target', files: ['lib/index.js'], function: 'answer' },
  operation: 'after',
  handler({ result }) { return result + 1 },
}
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'semantic-isolation-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'function answer() { return 1 }; module.exports = { answer }\n')
  synchronizeProfile(profile)
  const transformed = readFileSync(join(target, 'lib/index.js'), 'utf8')
  const module = { exports: {} as any }
  new Function('module', 'exports', transformed)(module, module.exports)
  expect(module.exports.answer()).toBe(2)

  const transaction = beginProfileUpdate({ disabled: ['semantic-isolation-provider/after'] })
  expect(module.exports.answer()).toBe(2)
  transaction.rollback()
  expect(module.exports.answer()).toBe(2)
})

test('keeps the first semantic replacement and skips later conflicts', () => {
  const target = join(root, 'replace-target')
  const provider = join(root, 'replace-provider')
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(provider)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'replace-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'function answer() { return 1 }; module.exports = { answer }\n')
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'replace-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = ['first', 'second'].map(id => ({
  id,
  target: { package: 'replace-target', files: ['lib/index.js'], function: 'answer' },
  operation: 'replace',
  handler() { return 2 },
}))
`)
  discoverPackage(provider)

  const transformed = readFileSync(join(target, 'lib/index.js'), 'utf8')
  const module = { exports: {} as any }
  new Function('module', 'exports', transformed)(module, module.exports)
  expect(module.exports.answer()).toBe(2)
  expect(getPatchStatuses().find(patch => patch.key === 'replace-provider/first')?.state).toBe('bound')
  expect(getPatchStatuses().find(patch => patch.key === 'replace-provider/second')).toMatchObject({
    state: 'failed', error: expect.stringContaining('replace conflict'),
  })
})

test('stages disabled patches and restores runtime and disk state on rollback', () => {
  const profile = join(root, 'disabled-profile')
  const provider = join(profile, 'node_modules', 'toggle-provider')
  const target = join(profile, 'node_modules', 'toggle-target')
  mkdirSync(provider, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'toggle-provider': '1.0.0', 'toggle-target': '1.0.0' },
  }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'toggle-provider', version: '1.0.0', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'toggle',
  target: { package: 'toggle-target', files: ['lib/index.js'] },
  select: 'NumericLiteral',
  expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '2') },
}
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'toggle-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')
  synchronizeProfile(profile)
  expect(retainedGenerationCount()).toBe(1)

  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 2')
  const state = readFileSync(join(profile, 'harmony.json'), 'utf8')
  const transaction = beginProfileUpdate({ disabled: ['toggle-provider/toggle'] })
  expect(retainedGenerationCount()).toBe(2)
  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 1')
  transaction.rollback()
  expect(retainedGenerationCount()).toBe(1)
  expect(readFileSync(join(profile, 'harmony.json'), 'utf8')).toBe(state)
  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 2')

  const retry = beginProfileUpdate({ disabled: ['toggle-provider/toggle'] })
  expect(retry.generation).toBeGreaterThan(transaction.generation)
  retry.rollback()
  expect(retainedGenerationCount()).toBe(1)

  const committed = beginProfileUpdate({ disabled: ['toggle-provider/toggle'] })
  committed.commit()
  expect(retainedGenerationCount()).toBe(1)
  expect(getPatchStatuses().find(patch => patch.key === 'toggle-provider/toggle')?.state).toBe('disabled')
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8')).disabled).toEqual(['toggle-provider/toggle'])

  for (let index = 0; index < 32; index += 1) {
    const update = beginProfileUpdate({ disabled: index % 2 === 0 ? [] : ['toggle-provider/toggle'] })
    expect(retainedGenerationCount()).toBe(2)
    update.commit()
    expect(retainedGenerationCount()).toBe(1)
  }
})

test('customizes the official Settings shell bundle while Harmony is active', () => {
  const filename = join(process.cwd(), 'node_modules', '@deepseek-ai', 'dsh-client-ui-settings-general', 'lib', 'client.js')
  const source = readFileSync(filename, 'utf8')

  expect(source).toContain('__dshHarmonyBeforeSettingsClose')
  expect(source).toContain('onSelect: async (id)')
  expect(source).toContain('width:1040px;max-width:calc(100vw - 48px)')
  expect(source).toContain('id === "harmony"')
  expect(source).toContain('dshHarmonyNavIcon')
})

test('applies providers in the persisted manual order', () => {
  const profile = join(root, 'ordered-profile')
  const target = join(root, 'ordered-target')
  const first = join(profile, 'node_modules', 'first-provider')
  const second = join(profile, 'node_modules', 'second-provider')
  mkdirSync(profile, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(first, { recursive: true })
  mkdirSync(second, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'first-provider': '1.0.0', 'second-provider': '1.0.0' },
  }))
  writeFileSync(join(profile, 'harmony.json'), JSON.stringify({ order: ['second-provider', 'first-provider'], disabled: [] }))
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'ordered-target' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')
  writeFileSync(join(first, 'package.json'), JSON.stringify({
    name: 'first-provider',
    dsh: { harmony: {
      patches: ['./patch.cjs'],
      after: ['second-provider'],
      conflicts: ['second-provider'],
    } },
  }))
  writeFileSync(join(second, 'package.json'), JSON.stringify({
    name: 'second-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(first, 'patch.cjs'), `
module.exports = {
  id: 'test-patch',
  target: { package: 'ordered-target', files: ['lib/index.js'] },
  select: 'NumericLiteral',
  apply() { globalThis.__harmonyOrder.push('first') },
}
`)
  writeFileSync(join(second, 'patch.cjs'), `
module.exports = {
  id: 'test-patch',
  target: { package: 'ordered-target', files: ['lib/index.js'] },
  select: 'NumericLiteral',
  apply() { globalThis.__harmonyOrder.push('second') },
}
`)

  ;(globalThis as any).__harmonyOrder = []
  synchronizeProfile(profile)
  readFileSync(join(target, 'lib/index.js'), 'utf8')

  expect((globalThis as any).__harmonyOrder).toEqual(['second', 'first'])
  expect(currentProfile().incompatibilities).toEqual([{
    declaredBy: 'first-provider',
    conflictsWith: 'second-provider',
  }])
})

test('provides harmony and reloads a newly patched loader entry', async () => {
  const provider = join(root, 'live-provider')
  const laterProvider = join(root, 'later-live-provider')
  mkdirSync(provider)
  mkdirSync(laterProvider)
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'live-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'test-patch',
  target: { package: 'live-target', files: ['lib/index.js'] },
  select: 'SourceFile',
  apply() {},
}
`)
  writeFileSync(join(laterProvider, 'package.json'), JSON.stringify({
    name: 'later-live-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(laterProvider, 'patch.cjs'), `
module.exports = {
  id: 'test-patch',
  target: { package: 'live-target', files: ['lib/index.js'] },
  select: 'SourceFile',
  apply() {},
}
`)

  const previousPlugin = () => {}
  const nextPlugin = () => {}
  const imported: string[] = []
  const started: unknown[] = []
  const entry = {
    options: { id: 'live', name: 'live-target' },
    fiber: { uid: 1, runtime: { callback: previousPlugin } },
    loader: { unwrapExports(value: unknown) { return value } },
    parent: { tree: { async import(specifier: string) { imported.push(specifier); return nextPlugin } } },
    getOuterStack() { return [] },
    async _dispose() { this.fiber = undefined },
    async _start(plugin: unknown) {
      started.push(plugin)
      this.fiber = { uid: 2, runtime: { callback: plugin } }
    },
  } as any
  const provided: string[] = []
  const disposers: (() => void)[] = []
  applyHarmonyPlugin({
    provide(name: string) { provided.push(name) },
    logger: { error() {} },
    on() {},
    effect(start: () => () => void) { disposers.push(start()) },
    inject(services: string[], start: (ctx: any) => () => void) {
      const injected = services.includes('webServer')
        ? { webServer: { register() { return () => {} } } }
        : { clientModules: { rebuilt() {} } }
      disposers.push(start(injected))
    },
    loader: { *entries() { yield entry } },
  })

  await new Promise<void>(resolve => setImmediate(resolve))
  await new Promise<void>(resolve => setImmediate(resolve))
  discoverPackage(provider)
  discoverPackage(laterProvider)
  const latestGeneration = getPatchStatuses().find(patch => patch.owner === 'later-live-provider')!.generation
  await new Promise<void>(resolve => setImmediate(resolve))

  expect(provided).toEqual(['harmony'])
  expect(imported.at(-1)).toBe(`live-target?dsh-harmony=${latestGeneration}`)
  expect(entry.options.name).toBe('live-target')
  expect(started).toEqual([nextPlugin])
  for (const dispose of disposers) dispose()
})

test('reconciles the existing Loader tree when Harmony activates', async () => {
  const profile = join(root, 'initial-loader-profile')
  const provider = join(profile, 'node_modules', 'initial-loader-provider')
  const incompatible = join(profile, 'node_modules', 'incompatible-loader-provider')
  const target = join(root, 'initial-loader-target')
  mkdirSync(provider, { recursive: true })
  mkdirSync(incompatible, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'initial-loader-provider': '1', 'incompatible-loader-provider': '1' },
  }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'initial-loader-provider',
    dsh: { harmony: { patches: ['./patch.cjs'], conflicts: ['incompatible-loader-provider'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = [{
  id: 'test-patch',
  target: { package: 'initial-loader-target', files: ['lib/index.js'] },
  select: 'SourceFile',
  apply() {},
}, {
  id: 'wrong-count',
  target: { package: 'initial-loader-target', files: ['lib/index.js'] },
  select: 'NumericLiteral',
  expect: 2,
  apply() {},
}, {
  id: 'missing-target',
  target: { package: 'initial-loader-target-absent', files: ['lib/index.js'] },
  select: 'SourceFile',
  apply() {},
}]
`)
  writeFileSync(join(incompatible, 'package.json'), JSON.stringify({
    name: 'incompatible-loader-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(incompatible, 'patch.cjs'), `
module.exports = {
  id: 'test-patch',
  target: { package: 'initial-loader-target', files: ['lib/index.js'] },
  select: 'SourceFile',
  apply() {},
}
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'initial-loader-target' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')
  synchronizeProfile(profile)

  const previousPlugin = () => {}
  const nextPlugin = () => {}
  const started: unknown[] = []
  const targetEntry = {
    options: { name: 'initial-loader-target' },
    fiber: { uid: 1, runtime: { callback: previousPlugin } },
    loader: { unwrapExports(value: unknown) { return value } },
    parent: { tree: { async import() { readFileSync(join(target, 'lib/index.js'), 'utf8'); return nextPlugin } } },
    getOuterStack() { return [] },
    async _dispose() { this.fiber = undefined },
    async _start(plugin: unknown) {
      started.push(plugin)
      this.fiber = { uid: 2, runtime: { callback: plugin } }
    },
  } as any
  const entries = [
    targetEntry,
    { options: { name: 'initial-loader-provider' } },
    { options: { name: 'incompatible-loader-provider' } },
    { options: { name: 'dsh-harmony' } },
  ]
  const disposers: (() => void)[] = []
  const warnings: string[] = []
  applyHarmonyPlugin({
    provide() {},
    logger: { error() {}, warn(message: string) { warnings.push(message) } },
    on() {},
    effect(start: () => () => void) { disposers.push(start()) },
    inject(services: string[], start: (ctx: any) => () => void) {
      const injected = services.includes('webServer')
        ? { webServer: { register() { return () => {} } } }
        : { clientModules: { rebuilt() {} } }
      disposers.push(start(injected))
    },
    loader: { *entries() { yield* entries } },
  })

  await new Promise<void>(resolve => setImmediate(resolve))
  await new Promise<void>(resolve => setImmediate(resolve))
  expect(started).toEqual([nextPlugin])
  expect(warnings[0]).toBe('dsh-harmony: "initial-loader-provider" declares "incompatible-loader-provider" incompatible; both remain loaded')
  expect(warnings[1]).toContain('skipped Patch "initial-loader-provider/wrong-count"')
  expect(warnings[1]).toContain('expected 2 match(es)')
  expect(warnings[2]).toContain('skipped Patch "initial-loader-provider/missing-target"')
  expect(warnings[2]).toContain('is not installed')
  for (const dispose of disposers) dispose()
})

test('sends client bundle changes through the official client HMR path', async () => {
  const provider = join(root, 'client-provider')
  mkdirSync(provider)
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'client-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'test-patch',
  target: { package: 'web-target', files: ['lib/client.js'] },
  select: 'SourceFile',
  apply() {},
}
`)

  const entry = { options: { id: 'web', name: 'web-target' } } as any
  const updates: any[][] = []
  const group = {
    data: [entry.options],
    async update(config: any[]) { updates.push(config) },
  }
  entry.parent = group
  const rebuilt: string[] = []
  const disposers: (() => void)[] = []
  applyHarmonyPlugin({
    provide() {},
    logger: { error() {} },
    on() {},
    effect(start: () => () => void) { disposers.push(start()) },
    inject(services: string[], start: (ctx: any) => () => void) {
      const injected = services.includes('webServer')
        ? { webServer: { register() { return () => {} } } }
        : { clientModules: { rebuilt(name: string) { rebuilt.push(name) } } }
      disposers.push(start(injected))
    },
    loader: { *entries() { yield entry } },
  })

  discoverPackage(provider)
  await new Promise<void>(resolve => setImmediate(resolve))

  expect(rebuilt).toEqual(['web-target'])
  expect(updates).toEqual([])
  for (const dispose of disposers) dispose()
})

test('keeps the previous loader fiber when a patched replacement fails', async () => {
  const provider = join(root, 'failing-live-provider')
  mkdirSync(provider)
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'failing-live-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'test-patch',
  target: { package: 'failing-live-target', files: ['lib/index.js'] },
  select: 'SourceFile',
  apply() {},
}
`)

  const previousPlugin = () => {}
  const nextPlugin = () => {}
  const errors: unknown[] = []
  const entry = {
    options: { id: 'failing-live', name: 'failing-live-target' },
    fiber: { uid: 1, runtime: { callback: previousPlugin } },
    loader: { unwrapExports(value: unknown) { return value } },
    parent: { tree: { async import() { return nextPlugin } } },
    getOuterStack() { return [] },
    async _dispose() { this.fiber = undefined },
    async _start(plugin: unknown) {
      if (plugin === nextPlugin) throw new Error('replacement failed')
      this.fiber = { uid: 2, runtime: { callback: plugin } }
    },
  } as any
  const disposers: (() => void)[] = []
  applyHarmonyPlugin({
    provide() {},
    logger: { error(error: unknown) { errors.push(error) } },
    on() {},
    effect(start: () => () => void) { disposers.push(start()) },
    inject(services: string[], start: (ctx: any) => () => void) {
      const injected = services.includes('webServer')
        ? { webServer: { register() { return () => {} } } }
        : { clientModules: { rebuilt() {} } }
      disposers.push(start(injected))
    },
    loader: { *entries() { yield entry } },
  })

  discoverPackage(provider)
  await new Promise<void>(resolve => setImmediate(resolve))

  expect(entry.options.name).toBe('failing-live-target')
  expect(entry.fiber.runtime.callback).toBe(previousPlugin)
  expect(errors).toHaveLength(1)
  for (const dispose of disposers) dispose()
})

test('rolls back every loader entry when dispose fails midway', async () => {
  const oldFirst = () => {}
  const oldSecond = () => {}
  const nextFirst = () => {}
  const nextSecond = () => {}
  const makeEntry = (name: string, previous: () => void, next: () => void, failDispose = false): any => ({
    options: { name },
    fiber: { uid: 1, runtime: { callback: previous } },
    loader: { unwrapExports(value: unknown) { return value } },
    parent: { tree: { async import() { return next } } },
    getOuterStack() { return [] },
    async _dispose() {
      this.fiber = undefined
      if (failDispose) throw new Error('dispose failed')
    },
    async _start(plugin: unknown) {
      this.fiber = { uid: 2, runtime: { callback: plugin } }
    },
  })
  const first = makeEntry('multi-target', oldFirst, nextFirst)
  const second = makeEntry('multi-target', oldSecond, nextSecond, true)

  await expect(reloadEntries([first, second], 1)).rejects.toThrow('dispose failed')
  expect(first.fiber.runtime.callback).toBe(oldFirst)
  expect(second.fiber.runtime.callback).toBe(oldSecond)
})

test('reconciles providers against live Loader entries', () => {
  const profile = join(root, 'loader-tree-profile')
  const provider = join(profile, 'node_modules', 'loader-tree-provider')
  const target = join(root, 'loader-tree-target')
  mkdirSync(provider, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { 'loader-tree-provider': '1' } }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'loader-tree-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'test-patch',
  target: { package: 'loader-tree-target', files: ['lib/index.js'] },
  select: 'NumericLiteral',
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '2') },
}
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'loader-tree-target' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')

  synchronizeProfile(profile)
  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 2')
  synchronizePluginOrder(['dsh-harmony'])
  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 1')
  synchronizePluginOrder(['dsh-harmony', 'loader-tree-provider'])
  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 2')
})

test('keeps the complete previous registry when a profile update fails', () => {
  const profile = join(root, 'transaction-profile')
  const first = join(profile, 'node_modules', 'transaction-first')
  const second = join(profile, 'node_modules', 'transaction-second')
  const target = join(root, 'transaction-target')
  mkdirSync(first, { recursive: true })
  mkdirSync(second, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { 'transaction-first': '1' } }))
  writeFileSync(join(first, 'package.json'), JSON.stringify({
    name: 'transaction-first',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(first, 'patch.cjs'), `
module.exports = {
  id: 'test-patch',
  target: { package: 'transaction-target', files: ['lib/index.js'] },
  select: 'NumericLiteral',
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '2') },
}
`)
  writeFileSync(join(second, 'package.json'), JSON.stringify({
    name: 'transaction-second',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(second, 'patch.cjs'), 'throw new Error("broken provider")\n')
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'transaction-target' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')

  synchronizeProfile(profile)
  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 2')
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { 'transaction-second': '1' } }))

  expect(() => synchronizeProfile(profile)).toThrow('broken provider')
  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 2')
})

test('reloads a changed patch file while the profile is running', async () => {
  const profile = join(root, 'watched-profile')
  const provider = join(profile, 'node_modules', 'watched-provider')
  const target = join(root, 'watched-target')
  mkdirSync(provider, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { 'watched-provider': '1' } }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'watched-provider',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  const patchFile = join(provider, 'patch.cjs')
  const writePatch = (value: number): void => writeFileSync(patchFile, `
module.exports = {
  id: 'test-patch',
  target: { package: 'watched-target', files: ['lib/index.js'] },
  select: 'NumericLiteral',
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '${value}') },
}
`)
  writePatch(2)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'watched-target' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')

  synchronizeProfile(profile)
  const errors: unknown[] = []
  const stop = watchProfile(() => { beginPluginUpdate(['watched-provider']).commit() }, error => errors.push(error))
  try {
    await delay(WATCH_READY_DELAY)
    expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 2')
    writePatch(3)
    await expect.poll(
      () => readFileSync(join(target, 'lib/index.js'), 'utf8'),
      { timeout: 5000 },
    ).toContain('value = 3')
    writeFileSync(patchFile, 'throw new Error("invalid patch")\n')
    await expect.poll(() => errors.length, { timeout: 5000 }).toBeGreaterThan(0)
    expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 3')
  } finally {
    stop()
  }
})

test('watches a newly declared patch file after its first load fails', async () => {
  const profile = join(root, 'watched-path-profile')
  const provider = join(profile, 'node_modules', 'watched-path-provider')
  const target = join(root, 'watched-path-target')
  mkdirSync(provider, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  const manifest = join(provider, 'package.json')
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { 'watched-path-provider': '1' } }))
  writeFileSync(manifest, JSON.stringify({
    name: 'watched-path-provider',
    dsh: { harmony: { patches: ['./old.cjs'] } },
  }))
  writeFileSync(join(provider, 'old.cjs'), `
module.exports = {
  id: 'test-patch',
  target: { package: 'watched-path-target', files: ['lib/index.js'] },
  select: 'NumericLiteral',
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '2') },
}
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'watched-path-target' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')

  synchronizeProfile(profile)
  const errors: unknown[] = []
  const stop = watchProfile(() => { beginPluginUpdate(['watched-path-provider']).commit() }, error => errors.push(error))
  try {
    await delay(WATCH_READY_DELAY)
    expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 2')
    writeFileSync(manifest, JSON.stringify({
      name: 'watched-path-provider',
      dsh: { harmony: { patches: ['./new.cjs'] } },
    }))
    await expect.poll(() => errors.length, { timeout: 5000 }).toBeGreaterThan(0)
    await delay(WATCH_READY_DELAY)
    writeFileSync(join(provider, 'new.cjs'), `
module.exports = {
  id: 'test-patch',
  target: { package: 'watched-path-target', files: ['lib/index.js'] },
  select: 'NumericLiteral',
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '3') },
}
`)
    await expect.poll(
      () => readFileSync(join(target, 'lib/index.js'), 'utf8'),
      { timeout: 5000 },
    ).toContain('value = 3')
  } finally {
    stop()
  }
})

test('names both providers while skipping a Patch whose selector was removed earlier', () => {
  const profile = join(root, 'conflict-profile')
  const target = join(root, 'conflict-target')
  const remover = join(profile, 'node_modules', 'remover')
  const reader = join(profile, 'node_modules', 'reader')
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(remover, { recursive: true })
  mkdirSync(reader, { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { remover: '1.0.0', reader: '1.0.0' },
  }))
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'conflict-target' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')
  for (const name of ['remover', 'reader']) {
    writeFileSync(join(profile, 'node_modules', name, 'package.json'), JSON.stringify({
      name,
      dsh: { harmony: { patches: ['./patch.cjs'] } },
    }))
  }
  writeFileSync(join(remover, 'patch.cjs'), `
module.exports = {
  id: 'test-patch',
  target: { package: 'conflict-target', files: ['lib/index.js'] },
  select: 'NumericLiteral',
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), 'undefined') },
}
`)
  writeFileSync(join(reader, 'patch.cjs'), `
module.exports = {
  id: 'test-patch',
  target: { package: 'conflict-target', files: ['lib/index.js'] },
  select: 'NumericLiteral',
  apply() {},
}
`)

  synchronizeProfile(profile)

  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = undefined')
  expect(getPatchStatuses().find(patch => patch.key === 'reader/test-patch')).toMatchObject({
    state: 'failed', error: expect.stringMatching(/reader[\s\S]*remover/),
  })
})

test('reloads a provider whose patch target changes', () => {
  const profile = join(root, 'retarget-profile')
  const provider = join(profile, 'node_modules', 'retargeter')
  const firstTarget = join(root, 'retarget-first')
  const secondTarget = join(root, 'retarget-second')
  mkdirSync(provider, { recursive: true })
  mkdirSync(join(firstTarget, 'lib'), { recursive: true })
  mkdirSync(join(secondTarget, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ dependencies: { retargeter: '1' } }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'retargeter',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  for (const [dir, name] of [[firstTarget, 'retarget-first'], [secondTarget, 'retarget-second']] as const) {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name }))
    writeFileSync(join(dir, 'lib/index.js'), 'export const value = 1\n')
  }
  const writePatch = (target: string, value: number): void => writeFileSync(join(provider, 'patch.cjs'), `
module.exports = {
  id: 'test-patch',
  target: { package: '${target}', files: ['lib/index.js'] },
  select: 'NumericLiteral',
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '${value}') },
}
`)

  writePatch('retarget-first', 2)
  synchronizeProfile(profile)
  expect(readFileSync(join(firstTarget, 'lib/index.js'), 'utf8')).toContain('value = 2')

  writePatch('retarget-second', 3)
  synchronizeProfile(profile)
  expect(readFileSync(join(firstTarget, 'lib/index.js'), 'utf8')).toContain('value = 1')
  expect(readFileSync(join(secondTarget, 'lib/index.js'), 'utf8')).toContain('value = 3')
})

test('reloads a provider when its local CommonJS helper changes', () => {
  const profile = join(root, 'provider-helper-profile')
  const provider = join(profile, 'node_modules', 'provider-helper')
  const target = join(profile, 'node_modules', 'provider-helper-target')
  mkdirSync(provider, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'provider-helper': '1', 'provider-helper-target': '1' },
  }))
  const writeManifest = (version: string): void => writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'provider-helper', version, dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
const value = require('./value.cjs')
module.exports = {
  id: 'helper', target: { package: 'provider-helper-target', files: ['lib/index.js'] },
  select: 'NumericLiteral', expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), String(value)) },
}
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'provider-helper-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')
  writeManifest('1.0.0')
  writeFileSync(join(provider, 'value.cjs'), 'module.exports = 2\n')
  synchronizeProfile(profile)
  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 2')

  writeManifest('2.0.0')
  writeFileSync(join(provider, 'value.cjs'), 'module.exports = 3\n')
  beginPluginUpdate(['provider-helper', 'provider-helper-target'], true).commit()
  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 3')
})

test('restores the CommonJS module cache when a reload fails', async () => {
  const target = join(root, 'cjs-rollback-target')
  const entryFile = join(target, 'index.cjs')
  mkdirSync(target)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'cjs-rollback-target' }))
  writeFileSync(entryFile, 'module.exports = { value: 2 }\n')
  const require = createRequire(import.meta.url)
  const previousPlugin = require(entryFile)
  writeFileSync(entryFile, 'module.exports = { value: 3 }\n')
  const entry = {
    options: { name: entryFile },
    fiber: { uid: 1, runtime: { callback: previousPlugin } },
    loader: { unwrapExports(value: unknown) { return value } },
    parent: { tree: { ctx: { baseUrl: import.meta.url }, async import() { return require(entryFile) } } },
    getOuterStack() { return [] },
    async _dispose() { this.fiber = undefined },
    async _start(plugin: any) {
      if (plugin.value === 3) throw new Error('candidate start failed')
      this.fiber = { uid: 2, runtime: { callback: plugin } }
    },
  } as any

  await expect(reloadEntries([entry], 1)).rejects.toThrow('candidate start failed')
  expect(entry.fiber.runtime.callback.value).toBe(2)
  expect(require(entryFile).value).toBe(2)
})

test('restores earlier CommonJS candidates when a later preload fails', async () => {
  const target = join(root, 'cjs-planning-rollback-target')
  const entryFile = join(target, 'index.cjs')
  mkdirSync(target)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'cjs-planning-rollback-target' }))
  writeFileSync(entryFile, 'module.exports = { value: 1 }\n')
  const require = createRequire(import.meta.url)
  const previousPlugin = require(entryFile)
  writeFileSync(entryFile, 'module.exports = { value: 2 }\n')
  const first = {
    options: { name: entryFile },
    fiber: { uid: 1, runtime: { callback: previousPlugin } },
    loader: { unwrapExports(value: unknown) { return value } },
    parent: { tree: { ctx: { baseUrl: import.meta.url }, async import() { return require(entryFile) } } },
    getOuterStack() { return [] },
  }
  const second = {
    options: { name: './missing-candidate.js' },
    fiber: { uid: 1, runtime: { callback: {} } },
    loader: { unwrapExports(value: unknown) { return value } },
    parent: { tree: { ctx: { baseUrl: import.meta.url }, async import() { throw new Error('preload failed') } } },
    getOuterStack() { return [] },
  }

  await expect(reloadEntries([first, second], 1)).rejects.toThrow('preload failed')
  expect(first.fiber.runtime.callback).toBe(previousPlugin)
  expect(require(entryFile)).toBe(previousPlugin)
})

test('reloads multiple CommonJS package entries with one shared module graph', async () => {
  const target = join(root, 'cjs-multiple-entry-target')
  const firstFile = join(target, 'first.cjs')
  const secondFile = join(target, 'second.cjs')
  const sharedFile = join(target, 'shared.cjs')
  mkdirSync(target)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'cjs-multiple-entry-target', type: 'commonjs' }))
  writeFileSync(sharedFile, 'module.exports = { generation: 1 }\n')
  writeFileSync(firstFile, "module.exports = { shared: require('./shared.cjs') }\n")
  writeFileSync(secondFile, "module.exports = { shared: require('./shared.cjs') }\n")
  const require = createRequire(import.meta.url)
  const firstPlugin = require(firstFile)
  const secondPlugin = require(secondFile)
  expect(firstPlugin.shared).toBe(secondPlugin.shared)
  writeFileSync(sharedFile, 'module.exports = { generation: 2 }\n')
  const entry = (filename: string, plugin: unknown) => ({
    options: { name: filename },
    fiber: { uid: 1, runtime: { callback: plugin } },
    loader: { unwrapExports(value: unknown) { return value } },
    parent: { tree: { ctx: { baseUrl: import.meta.url }, async import() { return require(filename) } } },
    getOuterStack() { return [] },
    async _dispose() { this.fiber = undefined },
    async _start(next: unknown) { this.fiber = { uid: 2, runtime: { callback: next } } },
  }) as any
  const firstEntry = entry(firstFile, firstPlugin)
  const secondEntry = entry(secondFile, secondPlugin)

  await reloadEntries([firstEntry, secondEntry], 2)
  expect(firstEntry.fiber.runtime.callback.shared.generation).toBe(2)
  expect(firstEntry.fiber.runtime.callback.shared).toBe(secondEntry.fiber.runtime.callback.shared)
  expect(require(sharedFile)).toBe(firstEntry.fiber.runtime.callback.shared)
})

test('reloads a provider and its patch graph with one shared CommonJS singleton', async () => {
  const profile = join(root, 'provider-cache-profile')
  const provider = join(profile, 'node_modules', 'provider-cache')
  const target = join(profile, 'node_modules', 'provider-cache-target')
  mkdirSync(provider, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'provider-cache': '1', 'provider-cache-target': '1' },
  }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'provider-cache', version: '1.0.0', main: './index.cjs', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'shared.cjs'), 'module.exports = { value: 41 }\n')
  writeFileSync(join(provider, 'index.cjs'), "module.exports = { shared: require('./shared.cjs') }\n")
  writeFileSync(join(provider, 'patch.cjs'), `
const shared = require('./shared.cjs')
module.exports = {
  id: 'provider-cache', target: { package: 'provider-cache-target', files: ['lib/index.js'] },
  select: 'NumericLiteral', expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), String(shared.value)) },
}
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'provider-cache-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 0\n')
  const require = createRequire(import.meta.url)
  synchronizeProfile(profile)
  const runningProvider = require(provider)
  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 41')

  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'provider-cache', version: '2.0.0', main: './index.cjs', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'shared.cjs'), 'module.exports = { value: 1 }\n')
  const transaction = beginPluginUpdate(['provider-cache', 'provider-cache-target'], true)
  expect(transaction.targets.has('provider-cache')).toBe(true)
  let failStart = false
  const entry = {
    options: { name: provider },
    fiber: { uid: 1, runtime: { callback: runningProvider } },
    loader: { unwrapExports(value: unknown) { return value } },
    parent: { tree: { ctx: { baseUrl: import.meta.url }, async import() { return require(provider) } } },
    getOuterStack() { return [] },
    async _dispose() { this.fiber = undefined },
    async _start(plugin: unknown) {
      if (failStart && (plugin as any).shared.value === 2) throw new Error('provider start failed')
      this.fiber = { uid: 2, runtime: { callback: plugin } }
    },
  } as any
  await reloadEntries([entry], transaction.generation)
  transaction.commit()

  expect(entry.fiber.runtime.callback.shared.value).toBe(1)
  expect(require(join(provider, 'shared.cjs'))).toBe(entry.fiber.runtime.callback.shared)
  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 1')

  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'provider-cache', version: '3.0.0', main: './index.cjs', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'shared.cjs'), 'module.exports = { value: 2 }\n')
  const failedTransaction = beginPluginUpdate(['provider-cache', 'provider-cache-target'], true)
  failStart = true
  await expect(reloadEntries([entry], failedTransaction.generation)).rejects.toThrow('provider start failed')
  failStart = false
  failedTransaction.rollback()
  expect(entry.fiber.runtime.callback.shared.value).toBe(1)
  expect(require(join(provider, 'shared.cjs'))).toBe(entry.fiber.runtime.callback.shared)
  expect(readFileSync(join(target, 'lib/index.js'), 'utf8')).toContain('value = 1')
})

test('ignores plugin lifecycle events emitted by Harmony reloads', async () => {
  const profile = join(root, 'provider-retry-profile')
  const provider = join(profile, 'node_modules', 'provider-retry')
  const target = join(profile, 'node_modules', 'provider-retry-target')
  mkdirSync(provider, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'provider-retry': '1', 'provider-retry-target': '1' },
  }))
  const writeManifest = (version: string): void => writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'provider-retry', version, main: './index.cjs', dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeManifest('1.0.0')
  writeFileSync(join(provider, 'shared.cjs'), 'module.exports = { value: 1 }\n')
  writeFileSync(join(provider, 'index.cjs'), "module.exports = { shared: require('./shared.cjs') }\n")
  writeFileSync(join(provider, 'patch.cjs'), `
const shared = require('./shared.cjs')
module.exports = {
  id: 'retry', target: { package: 'provider-retry-target', files: ['lib/index.js'] },
  select: 'NumericLiteral', expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), String(shared.value)) },
}
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'provider-retry-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 0\n')
  synchronizeProfile(profile)
  const require = createRequire(import.meta.url)
  const runningProvider = require(provider)
  let notifyPlugin = (_fiber: any): void => {}
  let candidateStarts = 0
  const providerEntry = {
    options: { name: 'provider-retry' },
    fiber: { uid: 1, runtime: { callback: runningProvider } },
    loader: { unwrapExports(value: unknown) { return value } },
    parent: { tree: {
      ctx: { baseUrl: pathToFileURL(join(profile, 'package.json')).href },
      async import() { return require(provider) },
    } },
    getOuterStack() { return [] },
    async _dispose() {
      this.fiber = undefined
      if (candidateStarts < 4) notifyPlugin({ entry: this })
    },
    async _start(plugin: any) {
      if (plugin.shared.value === 2) candidateStarts += 1
      if (candidateStarts < 4) notifyPlugin({ entry: this })
      if (plugin.shared.value === 2) throw new Error('provider candidate rejected')
      this.fiber = { uid: 2, runtime: { callback: plugin } }
    },
  } as any
  const entries = [
    providerEntry,
    { options: { name: 'provider-retry-target' } },
    { options: { name: 'dsh-harmony' } },
  ]
  const disposers: Array<() => void> = []
  await applyHarmonyPlugin({
    provide() {},
    logger: { error() {} },
    on(event: string, listener: (fiber: any) => void) {
      if (event === 'internal/plugin') notifyPlugin = listener
    },
    effect(start: () => any) {
      const dispose = start()
      if (typeof dispose === 'function') disposers.push(dispose)
    },
    inject(services: string[], start: (ctx: any) => any) {
      const injected = services.includes('webServer')
        ? { webServer: { host: '127.0.0.1', port: 0, register() { return () => {} } } }
        : { clientModules: { rebuilt() {} } }
      const dispose = start(injected)
      if (typeof dispose === 'function') disposers.push(dispose)
    },
    loader: { *entries() { yield* entries } },
  })
  await new Promise<void>(resolve => setImmediate(resolve))

  writeManifest('2.0.0')
  writeFileSync(join(provider, 'shared.cjs'), 'module.exports = { value: 2 }\n')
  notifyPlugin({})
  for (let index = 0; index < 8; index += 1) await new Promise<void>(resolve => setImmediate(resolve))
  expect(candidateStarts).toBe(1)
  expect(providerEntry.fiber.runtime.callback).toBe(runningProvider)
  for (const dispose of disposers.reverse()) dispose()
})

test('reloads typeless ESM through a generation URL', async () => {
  const target = join(root, 'typeless-esm-target')
  const entryFile = join(target, 'index.js')
  mkdirSync(target)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'typeless-esm-target' }))
  writeFileSync(entryFile, 'export default { value: 1 }\n')
  const previousPlugin = (await import(`${pathToFileURL(entryFile).href}?generation=0`)).default
  writeFileSync(entryFile, 'export default { value: 2 }\n')
  let usedImport = false
  const entry = {
    options: { name: entryFile },
    fiber: { uid: 1, runtime: { callback: previousPlugin } },
    loader: { unwrapExports(value: any) { return value.default } },
    parent: { tree: {
      ctx: { baseUrl: import.meta.url },
      async import(specifier: string) {
        usedImport = true
        return import(`${pathToFileURL(specifier.replace(/\?dsh-harmony=\d+$/, '')).href}?generation=1`)
      },
    } },
    getOuterStack() { return [] },
    async _dispose() { this.fiber = undefined },
    async _start(plugin: unknown) { this.fiber = { uid: 2, runtime: { callback: plugin } } },
  } as any

  await reloadEntries([entry], 1)
  expect(usedImport).toBe(true)
  expect(entry.fiber.runtime.callback.value).toBe(2)
})

test('keeps the import branch of a conditional export during reload', async () => {
  const profile = join(root, 'conditional-export-profile')
  const target = join(profile, 'node_modules', 'conditional-export-target')
  mkdirSync(target, { recursive: true })
  writeFileSync(join(profile, 'package.json'), '{}')
  writeFileSync(join(target, 'package.json'), JSON.stringify({
    name: 'conditional-export-target',
    type: 'module',
    exports: { import: './index.js', require: './index.cjs' },
  }))
  writeFileSync(join(target, 'index.js'), "export default { kind: 'esm' }\n")
  writeFileSync(join(target, 'index.cjs'), "module.exports = { kind: 'cjs' }\n")
  const esmFile = pathToFileURL(join(target, 'index.js')).href
  const previousPlugin = (await import(`${esmFile}?generation=0`)).default
  const entry = {
    options: { name: 'conditional-export-target' },
    fiber: { uid: 1, runtime: { callback: previousPlugin } },
    loader: { unwrapExports(value: any) { return value.default ?? value } },
    parent: { tree: {
      ctx: { baseUrl: pathToFileURL(join(profile, 'package.json')).href },
      async import() { return import(`${esmFile}?generation=1`) },
    } },
    getOuterStack() { return [] },
    async _dispose() { this.fiber = undefined },
    async _start(plugin: unknown) { this.fiber = { uid: 2, runtime: { callback: plugin } } },
  } as any

  await reloadEntries([entry], 1)
  expect(entry.fiber.runtime.callback.kind).toBe('esm')
})

test('keeps an ESM import branch that re-exports a CommonJS callback', async () => {
  const profile = join(root, 'mixed-conditional-export-profile')
  const target = join(profile, 'node_modules', 'mixed-conditional-export-target')
  mkdirSync(target, { recursive: true })
  writeFileSync(join(profile, 'package.json'), '{}')
  writeFileSync(join(target, 'package.json'), JSON.stringify({
    name: 'mixed-conditional-export-target',
    type: 'module',
    exports: { import: './entry.mjs', require: './require.cjs' },
  }))
  writeFileSync(join(target, 'implementation.cjs'), "module.exports = { kind: 'import-cjs' }\n")
  writeFileSync(join(target, 'entry.mjs'), "import plugin from './implementation.cjs'; export default plugin\n")
  writeFileSync(join(target, 'require.cjs'), "module.exports = { kind: 'require' }\n")
  const entryFile = pathToFileURL(join(target, 'entry.mjs')).href
  const previousPlugin = (await import(`${entryFile}?generation=0`)).default
  const entry = {
    options: { name: 'mixed-conditional-export-target' },
    fiber: { uid: 1, runtime: { callback: previousPlugin } },
    loader: { unwrapExports(value: any) { return value.default ?? value } },
    parent: { tree: {
      ctx: { baseUrl: pathToFileURL(join(profile, 'package.json')).href },
      async import() { return import(`${entryFile}?generation=1`) },
    } },
    getOuterStack() { return [] },
    async _dispose() { this.fiber = undefined },
    async _start(plugin: unknown) { this.fiber = { uid: 2, runtime: { callback: plugin } } },
  } as any

  await reloadEntries([entry], 1)
  expect(entry.fiber.runtime.callback.kind).toBe('import-cjs')
})

test('loads the CommonJS file selected by the import condition', async () => {
  const profile = join(root, 'cjs-conditional-export-profile')
  const target = join(profile, 'node_modules', 'cjs-conditional-export-target')
  mkdirSync(target, { recursive: true })
  writeFileSync(join(profile, 'package.json'), '{}')
  writeFileSync(join(target, 'package.json'), JSON.stringify({
    name: 'cjs-conditional-export-target',
    exports: { import: './import.cjs', require: './require.cjs' },
  }))
  writeFileSync(join(target, 'import.cjs'), "module.exports = { kind: 'import' }\n")
  writeFileSync(join(target, 'require.cjs'), "module.exports = { kind: 'require' }\n")
  const require = createRequire(pathToFileURL(join(profile, 'package.json')))
  const previousPlugin = require(join(target, 'import.cjs'))
  const entry = {
    options: { name: 'cjs-conditional-export-target' },
    fiber: { uid: 1, runtime: { callback: previousPlugin } },
    loader: { unwrapExports(value: any) { return value.default ?? value } },
    parent: { tree: { ctx: { baseUrl: pathToFileURL(join(profile, 'package.json')).href } } },
    getOuterStack() { return [] },
    async _dispose() { this.fiber = undefined },
    async _start(plugin: unknown) { this.fiber = { uid: 2, runtime: { callback: plugin } } },
  } as any

  await reloadEntries([entry], 1)
  expect(entry.fiber.runtime.callback.kind).toBe('import')
})

test('commits WebUI order updates only after loader reload succeeds', async () => {
  const profile = join(root, 'web-transaction-profile')
  const provider = join(profile, 'node_modules', 'web-transaction-provider')
  const target = join(profile, 'node_modules', 'web-transaction-target')
  const clientTarget = join(profile, 'node_modules', 'web-transaction-client')
  const secondClientTarget = join(profile, 'node_modules', 'web-transaction-client-b')
  mkdirSync(provider, { recursive: true })
  mkdirSync(join(target, 'lib'), { recursive: true })
  mkdirSync(join(clientTarget, 'lib'), { recursive: true })
  mkdirSync(join(secondClientTarget, 'lib'), { recursive: true })
  writeFileSync(join(profile, 'package.json'), JSON.stringify({
    dependencies: {
      'web-transaction-provider': '1',
      'web-transaction-target': '1',
      'web-transaction-client': '1',
      'web-transaction-client-b': '1',
    },
  }))
  writeFileSync(join(provider, 'package.json'), JSON.stringify({
    name: 'web-transaction-provider',
    version: '1.0.0',
    author: 'Patch Author',
    dsh: { harmony: { patches: ['./patch.cjs'] } },
  }))
  writeFileSync(join(provider, 'patch.cjs'), `
module.exports = [{
  id: 'transactional',
  target: { package: 'web-transaction-target', files: ['lib/index.js'] },
  select: 'NumericLiteral',
  expect: 1,
  apply({ node, edit }) { edit.overwrite(node.getStart(), node.getEnd(), '2') },
}, {
  id: 'client',
  target: { package: 'web-transaction-client', files: ['lib/client.js'] },
  select: 'NumericLiteral', expect: 1, apply() {},
}, {
  id: 'client-b',
  target: { package: 'web-transaction-client-b', files: ['lib/client.js'] },
  select: 'NumericLiteral', expect: 1, apply() {},
}]
`)
  writeFileSync(join(target, 'package.json'), JSON.stringify({ name: 'web-transaction-target', version: '1.0.0' }))
  writeFileSync(join(target, 'lib/index.js'), 'export const value = 1\n')
  writeFileSync(join(clientTarget, 'package.json'), JSON.stringify({ name: 'web-transaction-client', version: '1.0.0' }))
  writeFileSync(join(clientTarget, 'lib/client.js'), 'export const value = 1\n')
  writeFileSync(join(secondClientTarget, 'package.json'), JSON.stringify({ name: 'web-transaction-client-b', version: '1.0.0' }))
  writeFileSync(join(secondClientTarget, 'lib/client.js'), 'export const value = 1\n')
  synchronizeProfile(profile)

  const previousPlugin = () => {}
  const nextPlugin = () => {}
  let failNext = false
  let failClient: string | undefined
  const clientRebuilds: Array<{ name: string; order: string[] }> = []
  let startGate: Promise<void> | undefined
  const entry = {
    options: { name: 'web-transaction-target' },
    fiber: { uid: 1, runtime: { callback: previousPlugin } },
    loader: { unwrapExports(value: unknown) { return value } },
    parent: { tree: { async import() { return nextPlugin } } },
    getOuterStack() { return [] },
    async _dispose() { this.fiber = undefined },
    async _start(plugin: unknown) {
      const gate = startGate
      startGate = undefined
      if (gate !== undefined) await gate
      if (failNext) {
        failNext = false
        throw new Error('transaction reload failed')
      }
      this.fiber = { uid: 2, runtime: { callback: plugin } }
    },
  } as any
  const entries = [
    entry,
    { options: { name: 'web-transaction-provider' } },
    { options: { name: 'dsh-harmony' } },
  ]
  const routes = new Map<string, any>()
  const disposers: Array<() => void> = []
  await applyHarmonyPlugin({
    provide() {},
    logger: { error() {} },
    on() {},
    effect(start: () => any) {
      const dispose = start()
      if (typeof dispose === 'function') disposers.push(dispose)
    },
    inject(services: string[], start: (ctx: any) => any) {
      const injected = services.includes('webServer')
        ? { webServer: { register(route: any) { routes.set(route.path, route.handler); return () => {} } } }
        : { clientModules: { rebuilt(name: string) {
          if (failClient === name) throw new Error('client rebuild failed')
          clientRebuilds.push({ name, order: [...currentProfile().order] })
        } } }
      const dispose = start(injected)
      if (typeof dispose === 'function') disposers.push(dispose)
    },
    loader: { *entries() { yield* entries } },
  })
  await new Promise<void>(resolve => setImmediate(resolve))

  const stateBefore = readFileSync(join(profile, 'harmony.json'), 'utf8')
  const request = (order: string[]) => ({
    method: 'POST',
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ order })) },
  })
  const response = () => ({
    status: 0,
    body: '',
    writeHead(status: number) { this.status = status },
    end(body = '') { this.body = body },
  })
  const runtimeStatus = async () => {
    const result = response()
    await routes.get('/dsh-harmony/runtime')({ method: 'GET' }, result)
    return JSON.parse(result.body).reload
  }
  const desired = ['dsh-harmony', 'web-transaction-target', 'web-transaction-provider']
  failNext = true
  const failed = response()
  await routes.get('/dsh-harmony/order')(request(desired), failed)
  expect(failed.status).toBe(500)
  expect(await runtimeStatus()).toMatchObject({ state: 'failed', error: 'transaction reload failed' })
  expect(readFileSync(join(profile, 'harmony.json'), 'utf8')).toBe(stateBefore)
  expect(entry.fiber.runtime.callback).toBe(nextPlugin)

  const succeeded = response()
  await routes.get('/dsh-harmony/order')(request(desired), succeeded)
  expect(succeeded.status).toBe(200)
  expect(await runtimeStatus()).toMatchObject({ state: 'succeeded' })
  expect(JSON.parse(succeeded.body).order).toEqual(desired)
  expect(JSON.parse(succeeded.body).plugins.find((plugin: any) => plugin.name === 'web-transaction-provider')).toMatchObject({
    author: 'Patch Author', patchCount: 3,
  })
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8')).order).toEqual(desired)

  const committedState = readFileSync(join(profile, 'harmony.json'), 'utf8')
  clientRebuilds.length = 0
  failClient = 'web-transaction-client-b'
  const clientFailed = response()
  await routes.get('/dsh-harmony/order')(request(JSON.parse(stateBefore).order), clientFailed)
  failClient = undefined
  expect(clientFailed.status).toBe(500)
  expect(readFileSync(join(profile, 'harmony.json'), 'utf8')).toBe(committedState)
  expect(clientRebuilds.filter(item => item.name === 'web-transaction-client').map(item => item.order)).toEqual([
    JSON.parse(stateBefore).order,
    desired,
  ])

  let releaseStart!: () => void
  startGate = new Promise<void>(resolve => { releaseStart = resolve })
  failNext = true
  const first = response()
  const second = response()
  const firstUpdate = routes.get('/dsh-harmony/order')(request(JSON.parse(stateBefore).order), first)
  await new Promise<void>(resolve => setImmediate(resolve))
  expect(await runtimeStatus()).toMatchObject({ state: 'reloading' })
  const secondUpdate = routes.get('/dsh-harmony/order')(request(desired), second)
  releaseStart()
  await Promise.all([firstUpdate, secondUpdate])
  expect(first.status).toBe(500)
  expect(second.status).toBe(200)
  expect(JSON.parse(readFileSync(join(profile, 'harmony.json'), 'utf8')).order).toEqual(desired)
  for (const dispose of disposers) dispose()
})
