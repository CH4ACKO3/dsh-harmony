import type { HarmonyPatchContext, HarmonySourcePatch } from 'dsh-harmony'
import type ts from 'typescript'
import type {
  ClientExport,
  ElementSelector,
  InsertElementOptions,
  RemoveElementOptions,
  ReplaceElementOptions,
  ReplaceStringLiteralOptions,
  TransformPropsOptions,
  WrapElementOptions,
} from './types.js'

type ElementPatchOptions =
  | InsertElementOptions
  | RemoveElementOptions
  | ReplaceElementOptions
  | TransformPropsOptions
  | WrapElementOptions

interface JsxCall {
  call: ts.CallExpression
  runtime: string
  props: ts.Expression
  key?: ts.Expression
}

type Overwrite = (start: number, end: number, content: string) => void

interface SourceTrace {
  select: string
  effect: 'replace-element' | 'wrap-element' | 'insert-before' | 'insert-after' | 'transform-props'
  maxMatches: number
}

type TraceableSourcePatch = HarmonySourcePatch & { trace?: SourceTrace }

function assertText(value: string, name: string): void {
  if (value.length === 0) throw new Error(`dsh-harmony-react: ${name} must not be empty`)
}

function factorySelector(argument: string): string {
  return [
    `CallExpression[${argument}][expression.expression.right.name.name="jsx"]`,
    `CallExpression[${argument}][expression.expression.right.name.name="jsxs"]`,
  ].join(', ')
}

function exportSelector(value: ClientExport, argument: 'arguments.0' | 'arguments.1'): string {
  const access = argument === 'arguments.0' ? argument : `${argument}.expression`
  return factorySelector([
    `${access}.expression.expression.name="require"`,
    `${access}.expression.arguments.0.text=${JSON.stringify(value.module)}`,
    `${access}.argumentExpression.text=${JSON.stringify(value.export)}`,
  ].join(']['))
}

function selectorOf(selector: ElementSelector): string {
  if ('tsquery' in selector) {
    assertText(selector.tsquery, 'select.tsquery')
    return selector.tsquery
  }
  if ('component' in selector) {
    assertText(selector.component, 'select.component')
    const name = JSON.stringify(selector.component)
    return [
      factorySelector(`arguments.0.name=${name}`),
      factorySelector(`arguments.0.name.name=${name}`),
    ].join(', ')
  }
  assertText(selector.intrinsic, 'select.intrinsic')
  return factorySelector(`arguments.0.text=${JSON.stringify(selector.intrinsic)}`)
}

function sourceOf(context: HarmonyPatchContext, node: ts.Node): string {
  return context.source.slice(node.getStart(context.sourceFile), node.getEnd())
}

function jsxCallOf(context: HarmonyPatchContext): JsxCall {
  const node = context.node
  if (context.ts.isCallExpression(node) && node.arguments.length >= 2) {
    let expression: ts.Expression = node.expression
    while (context.ts.isParenthesizedExpression(expression)) expression = expression.expression
    if (context.ts.isBinaryExpression(expression)
      && expression.operatorToken.kind === context.ts.SyntaxKind.CommaToken
      && context.ts.isPropertyAccessExpression(expression.right)
      && (expression.right.name.text === 'jsx' || expression.right.name.text === 'jsxs')) {
      return {
        call: node,
        runtime: sourceOf(context, expression.right.expression),
        props: node.arguments[1]!,
        key: node.arguments[2],
      }
    }
  }
  throw new Error('dsh-harmony-react: selector must directly match a compiled jsx/jsxs call')
}

function clientExport(value: ClientExport, name: string): string {
  assertText(value.module, `${name}.module`)
  assertText(value.export, `${name}.export`)
  return `require(${JSON.stringify(value.module)})[${JSON.stringify(value.export)}]`
}

function keyArgument(context: HarmonyPatchContext, call: JsxCall): string {
  return call.key === undefined ? '' : `, ${sourceOf(context, call.key)}`
}

function jsx(context: HarmonyPatchContext, call: JsxCall, type: string, props: string): string {
  return `(0, ${call.runtime}.jsx)(${type}, ${props})`
}

function fragment(
  context: HarmonyPatchContext,
  call: JsxCall,
  children: [string, string],
): string {
  return `(0, ${call.runtime}.jsxs)(${call.runtime}.Fragment, { children: [${children.join(', ')}] }${keyArgument(context, call)})`
}

function patch(
  options: ElementPatchOptions,
  trace: SourceTrace | undefined,
  apply: (context: HarmonyPatchContext, call: JsxCall, overwrite: Overwrite) => void,
): TraceableSourcePatch {
  assertText(options.id, 'id')
  assertText(options.target.package, 'target.package')
  assertText(options.target.version, 'target.version')
  if (!Number.isInteger(options.expect) || options.expect < 0) {
    throw new Error('dsh-harmony-react: expect must be a non-negative integer')
  }
  const rangesByEdit = new WeakMap<object, Array<{ start: number; end: number }>>()
  return {
    id: options.id,
    target: {
      package: options.target.package,
      version: options.target.version,
      files: ['lib/client.js'],
    },
    select: selectorOf(options.select),
    expect: options.expect,
    ...(trace === undefined ? {} : { trace }),
    apply(context) {
      const ranges = rangesByEdit.get(context.edit) ?? []
      rangesByEdit.set(context.edit, ranges)
      const overwrite: Overwrite = (start, end, content) => {
        if (ranges.some(range => start < range.end && range.start < end)) {
          throw new Error('dsh-harmony-react: selector resolved to overlapping source ranges; split nested elements into ordered patches')
        }
        ranges.push({ start, end })
        context.edit.overwrite(start, end, content)
      }
      apply(context, jsxCallOf(context), overwrite)
    },
  }
}

export function replaceElement(options: ReplaceElementOptions): HarmonySourcePatch {
  const replacement = clientExport(options.with, 'with')
  return patch(options, {
    select: exportSelector(options.with, 'arguments.0'), effect: 'replace-element', maxMatches: options.expect,
  }, (context, { call }, overwrite) => {
    const type = call.arguments[0]!
    overwrite(type.getStart(context.sourceFile), type.getEnd(), replacement)
  })
}

export function wrapElement(options: WrapElementOptions): HarmonySourcePatch {
  const wrapper = clientExport(options.with, 'with')
  return patch(options, {
    select: exportSelector(options.with, 'arguments.0'), effect: 'wrap-element', maxMatches: options.expect,
  }, (context, call, overwrite) => {
    const original = sourceOf(context, call.call)
    const replacement = `(0, ${call.runtime}.jsx)(${wrapper}, { children: ${original} }${keyArgument(context, call)})`
    overwrite(call.call.getStart(context.sourceFile), call.call.getEnd(), replacement)
  })
}

function insertElement(options: InsertElementOptions, position: 'before' | 'after'): HarmonySourcePatch {
  const inserted = clientExport(options.insert, 'insert')
  return patch(options, {
    select: exportSelector(options.insert, 'arguments.0'),
    effect: position === 'before' ? 'insert-before' : 'insert-after',
    maxMatches: options.expect,
  }, (context, call, overwrite) => {
    const addition = jsx(context, call, inserted, '{}')
    const original = sourceOf(context, call.call)
    const children: [string, string] = position === 'before' ? [addition, original] : [original, addition]
    overwrite(
      call.call.getStart(context.sourceFile),
      call.call.getEnd(),
      fragment(context, call, children),
    )
  })
}

export function insertBefore(options: InsertElementOptions): HarmonySourcePatch {
  return insertElement(options, 'before')
}

export function insertAfter(options: InsertElementOptions): HarmonySourcePatch {
  return insertElement(options, 'after')
}

export function transformProps(options: TransformPropsOptions): HarmonySourcePatch {
  const transform = clientExport(options.transform, 'transform')
  return patch(options, {
    select: exportSelector(options.transform, 'arguments.1'), effect: 'transform-props', maxMatches: options.expect,
  }, (context, call, overwrite) => {
    const props = sourceOf(context, call.props)
    overwrite(
      call.props.getStart(context.sourceFile),
      call.props.getEnd(),
      `${transform}(${props})`,
    )
  })
}

export function removeElement(options: RemoveElementOptions): HarmonySourcePatch {
  return patch(options, undefined, (context, call, overwrite) => {
    overwrite(call.call.getStart(context.sourceFile), call.call.getEnd(), 'null')
  })
}

export function replaceStringLiteral(options: ReplaceStringLiteralOptions): HarmonySourcePatch {
  assertText(options.id, 'id')
  assertText(options.target.package, 'target.package')
  assertText(options.target.version, 'target.version')
  assertText(options.text, 'text')
  if (!Number.isInteger(options.expect) || options.expect < 0) {
    throw new Error('dsh-harmony-react: expect must be a non-negative integer')
  }
  return {
    id: options.id,
    target: {
      package: options.target.package,
      version: options.target.version,
      files: ['lib/client.js'],
    },
    select: `StringLiteral[text=${JSON.stringify(options.text)}]`,
    expect: options.expect,
    apply({ node, sourceFile, edit }) {
      edit.overwrite(node.getStart(sourceFile), node.getEnd(), JSON.stringify(options.with))
    },
  }
}
