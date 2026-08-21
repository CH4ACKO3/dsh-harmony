import MagicString from 'magic-string'
import ts from 'typescript'
import { tsquery, type Selector } from '@phenomnomnominal/tsquery'
import type { HarmonyPatch, HarmonySemanticPatch, HarmonySourcePatch } from './index.js'

export interface PatchIdentity {
  key: string
  owner: string
  declaration: string
}

export interface BoundSemanticPatch<T extends PatchIdentity = PatchIdentity> {
  registered: T
  patch: HarmonySemanticPatch
}

export interface BoundSourceTrace<T extends PatchIdentity = PatchIdentity> {
  registered: T
  patch: HarmonySourcePatch
}

export function parseSource(filename: string, source: string): ts.SourceFile {
  const scriptKind = filename.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : /\.(?:cts|mts|ts)$/.test(filename)
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS
  return ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, scriptKind)
}

export interface SourceDelta {
  start: number
  removed: number
  inserted: string
}

function copyStringRange(source: string, start: number, end: number): string {
  let copied = ''
  for (let offset = start; offset < end; offset += 8_192) {
    const length = Math.min(8_192, end - offset)
    const codes = new Uint16Array(length)
    for (let index = 0; index < length; index += 1) codes[index] = source.charCodeAt(offset + index)
    copied += String.fromCharCode(...codes)
  }
  return copied
}

export function sourceDelta(before: string, after: string): SourceDelta {
  if (before === after) return { start: before.length, removed: 0, inserted: '' }
  let start = 0
  const shared = Math.min(before.length, after.length)
  while (start < shared && before.charCodeAt(start) === after.charCodeAt(start)) start += 1
  let beforeEnd = before.length
  let afterEnd = after.length
  while (beforeEnd > start && afterEnd > start
    && before.charCodeAt(beforeEnd - 1) === after.charCodeAt(afterEnd - 1)) {
    beforeEnd -= 1
    afterEnd -= 1
  }
  return {
    start,
    removed: beforeEnd - start,
    inserted: copyStringRange(after, start, afterEnd),
  }
}

export function applySourceDelta(source: string, delta: SourceDelta): string {
  if (delta.removed === 0 && delta.inserted.length === 0) return source
  return source.slice(0, delta.start) + delta.inserted + source.slice(delta.start + delta.removed)
}

const SELECTOR_CACHE_LIMIT = 256
const selectorCache = new Map<string, Selector>()

function parsedSelector(selector: string): Selector {
  const cached = selectorCache.get(selector)
  if (cached !== undefined) {
    selectorCache.delete(selector)
    selectorCache.set(selector, cached)
    return cached
  }
  const parsed = tsquery.parse.ensure(selector)
  if (selectorCache.size >= SELECTOR_CACHE_LIMIT) selectorCache.delete(selectorCache.keys().next().value!)
  selectorCache.set(selector, parsed)
  return parsed
}

function query(sourceFile: ts.SourceFile, selector: string): ts.Node[] {
  return tsquery(sourceFile, parsedSelector(selector))
}

function sourceFileFor(
  filename: string,
  source: string,
  previous?: ts.SourceFile,
  previousDelta?: SourceDelta,
): ts.SourceFile {
  if (previous === undefined) return parseSource(filename, source)
  if (previous.text === source) return previous
  const delta = previousDelta ?? sourceDelta(previous.text, source)
  return ts.updateSourceFile(previous, source, ts.createTextChangeRange(
    ts.createTextSpan(delta.start, delta.removed),
    delta.inserted.length,
  ))
}

function matches(filename: string, source: string, selector: string): boolean {
  return query(parseSource(filename, source), selector).length > 0
}

function conflictOwner(filename: string, original: string, selector: string, history: ReadonlyArray<{ owner: string; source: string }>): string | undefined {
  let hadMatch = matches(filename, original, selector)
  let conflict: string | undefined
  for (const step of history) {
    const hasMatch = matches(filename, step.source, selector)
    if (hadMatch && !hasMatch) conflict = step.owner
    hadMatch = hasMatch
  }
  return conflict
}

function expectedMatches(registered: PatchIdentity, patch: HarmonyPatch, count: number, target: string): void {
  const expected = 'expect' in patch ? patch.expect : undefined
  if (expected === undefined && count > 0 || expected === count) return
  const wanted = expected === undefined ? 'at least 1' : String(expected)
  throw new Error(`dsh-harmony: patch ${JSON.stringify(registered.key)} expected ${wanted} match(es) in ${target}, found ${count}`)
}

export function applySourcePatch(
  filename: string,
  target: string,
  source: string,
  original: string,
  registered: PatchIdentity,
  patch: HarmonySourcePatch,
  history: ReadonlyArray<{ owner: string }>,
  historySources: () => ReadonlyArray<{ owner: string; source: string }>,
  previousSourceFile?: ts.SourceFile,
  previousDelta?: SourceDelta,
): { source: string; matches: number; sourceFile: ts.SourceFile; delta: SourceDelta } {
  const sourceFile = sourceFileFor(filename, source, previousSourceFile, previousDelta)
  const nodes = query(sourceFile, patch.select)
  try {
    expectedMatches(registered, patch, nodes.length, target)
  } catch (error) {
    if (nodes.length === 0) {
      const conflicting = conflictOwner(filename, original, patch.select, historySources())
      const reason = conflicting === undefined
        ? 'the selector matched no code in the original target'
        : `plugin ${JSON.stringify(conflicting)} removed or changed the selected code`
      throw Object.assign(new Error([
        `dsh-harmony: patch ${JSON.stringify(registered.key)} could not patch ${target}`,
        `  selector: ${patch.select}`,
        `  conflict: ${reason}`,
      ].join('\n')), { matches: nodes.length })
    }
    throw Object.assign(error as Error, { matches: nodes.length })
  }
  const edit = new MagicString(source)
  try {
    for (const node of nodes) patch.apply({
      patch: { key: registered.key, owner: registered.owner },
      source,
      sourceFile,
      node,
      edit,
      ts,
    })
  } catch (cause) {
    const applied = [...new Set(history.map(step => step.owner))]
    throw new Error([
      `dsh-harmony: patch ${JSON.stringify(registered.key)} failed while patching ${target}`,
      `  selector: ${patch.select}`,
      `  already applied: ${applied.length === 0 ? '(none)' : applied.join(', ')}`,
      `  error: ${cause instanceof Error ? cause.message : String(cause)}`,
    ].join('\n'), { cause })
  }
  const nextSource = edit.hasChanged() ? edit.toString() : source
  return { source: nextSource, matches: nodes.length, sourceFile, delta: sourceDelta(source, nextSource) }
}

interface SourceTraceMetadata {
  key: string
  owner: string
  effect: NonNullable<HarmonySourcePatch['trace']>['effect']
  declaration: string
  target: { package: string; file: string }
  confidence: 'candidate'
}

function jsxRuntimeExpression(sourceFile: ts.SourceFile, node: ts.Node, source: string): string | undefined {
  if (!ts.isCallExpression(node)) return undefined
  let expression: ts.Expression = node.expression
  while (ts.isParenthesizedExpression(expression)) expression = expression.expression
  if (!ts.isBinaryExpression(expression) || expression.operatorToken.kind !== ts.SyntaxKind.CommaToken
    || !ts.isPropertyAccessExpression(expression.right)
    || (expression.right.name.text !== 'jsx' && expression.right.name.text !== 'jsxs')) return undefined
  return source.slice(expression.right.expression.getStart(sourceFile), expression.right.expression.getEnd())
}

function uniqueIdentifier(node: ts.Node, base: string): string {
  const names = new Set<string>()
  const visit = (current: ts.Node): void => {
    if (ts.isIdentifier(current)) names.add(current.text)
    ts.forEachChild(current, visit)
  }
  visit(node)
  let name = base
  let suffix = 0
  while (names.has(name)) name = `${base}${++suffix}`
  return name
}

export function instrumentSourceTraces<T extends PatchIdentity>(
  filename: string,
  source: string,
  target: { package: string; file: string },
  patches: BoundSourceTrace<T>[],
): string {
  if (process.env.DSH_HARMONY_REACT_TRACE !== '1' || patches.length === 0) return source
  const sourceFile = parseSource(filename, source)
  const traced = new Map<string, { node: ts.CallExpression; runtime: string; traces: SourceTraceMetadata[] }>()
  for (const { registered, patch } of patches) {
    const trace = patch.trace
    if (trace === undefined) continue
    let nodes: ts.Node[]
    try {
      nodes = query(sourceFile, trace.select)
    } catch {
      continue
    }
    if (nodes.length === 0 || nodes.length > trace.maxMatches) continue
    for (const node of nodes) {
      const runtime = jsxRuntimeExpression(sourceFile, node, source)
      if (!ts.isCallExpression(node) || runtime === undefined) continue
      const key = `${node.getStart(sourceFile)}:${node.getEnd()}`
      const current = traced.get(key) ?? { node, runtime, traces: [] }
      current.traces.push({
        key: registered.key,
        owner: registered.owner,
        effect: trace.effect,
        declaration: registered.declaration,
        target,
        confidence: 'candidate',
      })
      traced.set(key, current)
    }
  }
  if (traced.size === 0) return source

  const helper = uniqueIdentifier(sourceFile, '__dshHarmonyPatchTrace')
  const edit = new MagicString(source)
  for (const { node, runtime, traces } of traced.values()) {
    const key = node.arguments[2]
    const keyArgument = key === undefined ? '' : `, ${source.slice(key.getStart(sourceFile), key.getEnd())}`
    edit.prependLeft(node.getStart(sourceFile), `(0, ${runtime}.jsx)(${helper}, { traces: ${JSON.stringify(traces)}, children: `)
    edit.appendRight(node.getEnd(), ` }${keyArgument})`)
  }
  const firstStatement = sourceFile.statements.find(statement => !ts.isExpressionStatement(statement)
    || !ts.isStringLiteral(statement.expression))
  const insertion = firstStatement?.getStart(sourceFile) ?? source.length
  edit.appendLeft(insertion, `function ${helper}(props){return props.children}\n${helper}.__dshHarmonyPatchTrace=true;\n`)
  return edit.toString()
}

type SemanticFunction = ts.FunctionDeclaration | ts.MethodDeclaration

function semanticName(node: SemanticFunction): string | undefined {
  if (ts.isFunctionDeclaration(node)) return node.name?.text
  const name = node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) ? node.name.text : undefined
  if (name === undefined) return undefined
  const parent = node.parent
  if (ts.isClassDeclaration(parent) || ts.isClassExpression(parent)) return parent.name === undefined ? name : `${parent.name.text}.${name}`
  return name
}

function semanticFunctions(sourceFile: ts.SourceFile, requested: string): SemanticFunction[] {
  const found: SemanticFunction[] = []
  const visit = (node: ts.Node): void => {
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node))
      && (semanticName(node) === requested || !requested.includes('.') && node.name?.getText(sourceFile) === requested)) found.push(node)
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

export function semanticMatchCount(
  filename: string,
  source: string,
  target: string,
  functionName: string,
  registered: PatchIdentity,
  patch: HarmonySemanticPatch,
): number {
  const count = semanticFunctions(parseSource(filename, source), functionName).length
  expectedMatches(registered, patch, count, target)
  return count
}

export function assertNoReplaceConflict<T extends PatchIdentity>(functionName: string, registered: BoundSemanticPatch<T>[]): void {
  const replacements = registered.filter(item => item.patch.operation === 'replace')
  if (replacements.length > 1) {
    throw new Error(`dsh-harmony: replace conflict in ${functionName}: ${replacements.map(item => item.registered.key).join(', ')}`)
  }
}

export function instrumentSemantic(
  filename: string,
  source: string,
  target: string,
  functionName: string,
  registered: PatchIdentity,
  patch: HarmonySemanticPatch,
  bindingKey: string,
): { source: string; matches: number; bindingKey: string } {
  const sourceFile = parseSource(filename, source)
  const nodes = semanticFunctions(sourceFile, functionName)
  expectedMatches(registered, patch, nodes.length, target)
  const edit = new MagicString(source)
  for (const node of nodes) {
    if (node.asteriskToken !== undefined) throw new Error(`dsh-harmony: semantic patches do not support generator ${functionName}`)
    if (node.body === undefined) throw new Error(`dsh-harmony: semantic target ${functionName} has no body`)
    const argsName = uniqueIdentifier(node, '__dshHarmonyArgs')
    const indexName = uniqueIdentifier(node, '__dshHarmonyIndex')
    const lengthName = uniqueIdentifier(node, '__dshHarmonyLength')
    const changedName = uniqueIdentifier(node, '__dshHarmonyChanged')
    const assignments = node.parameters.map((parameter, index) => {
      if (!ts.isIdentifier(parameter.name)) throw new Error(`dsh-harmony: semantic target ${functionName} requires named parameters`)
      return parameter.dotDotDotToken === undefined
        ? `${parameter.name.text} = ${parameter.initializer === undefined
          ? `${argsName}[${index}]`
          : `${argsName}[${index}] === undefined ? ${parameter.initializer.getText(sourceFile)} : ${argsName}[${index}]`};`
        : `${parameter.name.text} = ${argsName}.slice(${index});`
    }).join('')
    const synchronizeArguments = `const ${lengthName}=arguments.length;for(let ${indexName}=${argsName}.length;${indexName}<${lengthName};${indexName}++)delete arguments[${indexName}];for(let ${indexName}=0;${indexName}<${argsName}.length;${indexName}++)arguments[${indexName}]=${argsName}[${indexName}];arguments.length=${argsName}.length;`
    const synchronizeParameters = `const ${changedName}=${argsName}.length!==arguments.length||${argsName}.some((${argsName},${indexName})=>${argsName}!==arguments[${indexName}]);if(${changedName}){${synchronizeArguments}${assignments}}`
    const body = source.slice(node.body.getStart(sourceFile) + 1, node.body.getEnd() - 1)
    const callback = node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword) ? 'async ' : ''
    edit.overwrite(node.body.getStart(sourceFile) + 1, node.body.getEnd() - 1,
      `return globalThis.__dshHarmonyInvoke(${JSON.stringify(bindingKey)}, this, Array.from(arguments), ${callback}(${argsName}) => {${synchronizeParameters}${body}});`)
  }
  return { source: edit.toString(), matches: nodes.length, bindingKey }
}
