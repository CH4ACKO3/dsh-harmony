import type { HarmonyPatchContext, HarmonySourcePatch, HarmonySourceTrace } from 'dsh-harmony'
import type ts from 'typescript'
import type {
  ClientReference,
  ComponentPatchOptions,
  ComponentSelector,
  ElementPatchOptions,
  ElementSelector,
  ReactPatchTarget,
} from './types.js'

interface JsxCall {
  call: ts.CallExpression
  runtime: string
  props: ts.Expression
  key?: ts.Expression
}

type Overwrite = (start: number, end: number, content: string) => void

function assertText(value: string, name: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`dsh-harmony-react: ${name} must not be empty`)
  }
}

function validateTarget(target: ReactPatchTarget): void {
  assertText(target.package, 'target.package')
  assertText(target.version, 'target.version')
  if (!Array.isArray(target.files) || target.files.length === 0) {
    throw new Error('dsh-harmony-react: target.files must contain at least one file')
  }
  for (const file of target.files) assertText(file, 'target.files entry')
}

function validatePatch(options: { id: string; target: ReactPatchTarget; expect: number }): void {
  assertText(options.id, 'id')
  validateTarget(options.target)
  if (!Number.isInteger(options.expect) || options.expect < 0) {
    throw new Error('dsh-harmony-react: expect must be a non-negative integer')
  }
}

function factorySelector(argument: string): string {
  return [
    `CallExpression[${argument}][expression.expression.right.name.name="jsx"]`,
    `CallExpression[${argument}][expression.expression.right.name.name="jsxs"]`,
  ].join(', ')
}

function exportSelector(value: ClientReference, argument: 'arguments.0' | 'arguments.1'): string {
  const access = argument === 'arguments.0' ? argument : `${argument}.expression`
  return factorySelector([
    `${access}.expression.expression.name="require"`,
    `${access}.expression.arguments.0.text=${JSON.stringify(value.module)}`,
    `${access}.argumentExpression.text=${JSON.stringify(value.export)}`,
  ].join(']['))
}

function elementSelector(selector: ElementSelector): string {
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

function componentSelector(selector: ComponentSelector): string {
  if ('tsquery' in selector) {
    assertText(selector.tsquery, 'select.tsquery')
    return selector.tsquery
  }
  assertText(selector.name, 'select.name')
  const name = JSON.stringify(selector.name)
  return [
    `VariableDeclaration[name.name=${name}]`,
    `FunctionDeclaration[name.name=${name}]`,
  ].join(', ')
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
  throw new Error('dsh-harmony-react: element selector must directly match a compiled jsx/jsxs call')
}

function rewriteComponent(
  context: HarmonyPatchContext,
  overwrite: Overwrite,
  reference: string,
  operation: 'decorate' | 'replace',
): void {
  const node = context.node
  if (context.ts.isVariableDeclaration(node) && node.initializer !== undefined) {
    const replacement = operation === 'decorate'
      ? `${reference}(${sourceOf(context, node.initializer)})`
      : reference
    overwrite(node.initializer.getStart(context.sourceFile), node.initializer.getEnd(), replacement)
    return
  }

  if (context.ts.isFunctionDeclaration(node) && node.name !== undefined && node.body !== undefined) {
    const functionKeyword = node.getChildren(context.sourceFile)
      .find(child => child.kind === context.ts.SyntaxKind.FunctionKeyword)
    if (functionKeyword === undefined) {
      throw new Error('dsh-harmony-react: function declaration has no function keyword')
    }
    const asyncModifier = node.modifiers
      ?.find(modifier => modifier.kind === context.ts.SyntaxKind.AsyncKeyword)
    const expressionStart = asyncModifier?.getStart(context.sourceFile)
      ?? functionKeyword.getStart(context.sourceFile)
    const expression = context.source.slice(expressionStart, node.getEnd())
    const name = sourceOf(context, node.name)
    const exported = node.modifiers
      ?.some(modifier => modifier.kind === context.ts.SyntaxKind.ExportKeyword) ?? false
    const defaultExport = node.modifiers
      ?.some(modifier => modifier.kind === context.ts.SyntaxKind.DefaultKeyword) ?? false
    const value = operation === 'decorate' ? `${reference}(${expression})` : reference
    const exportPrefix = exported && !defaultExport ? 'export ' : ''
    const exportDefault = defaultExport ? `\nexport default ${name};` : ''
    overwrite(node.getStart(context.sourceFile), node.getEnd(), `${exportPrefix}const ${name} = ${value};${exportDefault}`)
    return
  }

  throw new Error(
    'dsh-harmony-react: component selector must directly match an initialized variable declaration '
    + 'or a named function declaration with a body',
  )
}

function clientReference(value: ClientReference, name: string): string {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`dsh-harmony-react: ${name} must be a client reference`)
  }
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

function fragment(context: HarmonyPatchContext, call: JsxCall, children: [string, string]): string {
  return `(0, ${call.runtime}.jsxs)(${call.runtime}.Fragment, { children: [${children.join(', ')}] }${keyArgument(context, call)})`
}

function sourcePatch(
  options: ElementPatchOptions | ComponentPatchOptions,
  select: string,
  trace: HarmonySourceTrace | undefined,
  apply: (context: HarmonyPatchContext, overwrite: Overwrite) => void,
): HarmonySourcePatch {
  validatePatch(options)
  const rangesByEdit = new WeakMap<object, Array<{ start: number; end: number }>>()
  return {
    id: options.id,
    target: {
      package: options.target.package,
      version: options.target.version,
      files: [...options.target.files],
    },
    select,
    expect: options.expect,
    ...(options.before === undefined ? {} : { before: [...options.before] }),
    ...(options.after === undefined ? {} : { after: [...options.after] }),
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
      apply(context, overwrite)
    },
  }
}

export function element(options: ElementPatchOptions): HarmonySourcePatch {
  const select = elementSelector(options.select)
  const operation = options.operation
  if (typeof operation !== 'object' || operation === null) {
    throw new Error('dsh-harmony-react: unknown element operation')
  }
  if (operation.kind === 'replace') {
    const replacement = clientReference(operation.with, 'operation.with')
    return sourcePatch(options, select, {
      select: exportSelector(operation.with, 'arguments.0'), effect: 'replace-element', maxMatches: options.expect,
    }, (context, overwrite) => {
      const call = jsxCallOf(context)
      const type = call.call.arguments[0]!
      overwrite(type.getStart(context.sourceFile), type.getEnd(), replacement)
    })
  }
  if (operation.kind === 'wrap') {
    const wrapper = clientReference(operation.with, 'operation.with')
    return sourcePatch(options, select, {
      select: exportSelector(operation.with, 'arguments.0'), effect: 'wrap-element', maxMatches: options.expect,
    }, (context, overwrite) => {
      const call = jsxCallOf(context)
      const original = sourceOf(context, call.call)
      overwrite(
        call.call.getStart(context.sourceFile),
        call.call.getEnd(),
        `(0, ${call.runtime}.jsx)(${wrapper}, { children: ${original} }${keyArgument(context, call)})`,
      )
    })
  }
  if (operation.kind === 'insert-before' || operation.kind === 'insert-after') {
    const inserted = clientReference(operation.with, 'operation.with')
    const position = operation.kind === 'insert-before' ? 'before' : 'after'
    return sourcePatch(options, select, {
      select: exportSelector(operation.with, 'arguments.0'),
      effect: position === 'before' ? 'insert-before' : 'insert-after',
      maxMatches: options.expect,
    }, (context, overwrite) => {
      const call = jsxCallOf(context)
      const addition = jsx(context, call, inserted, '{}')
      const original = sourceOf(context, call.call)
      const children: [string, string] = position === 'before' ? [addition, original] : [original, addition]
      overwrite(call.call.getStart(context.sourceFile), call.call.getEnd(), fragment(context, call, children))
    })
  }
  if (operation.kind === 'transform-props') {
    const transform = clientReference(operation.with, 'operation.with')
    return sourcePatch(options, select, {
      select: exportSelector(operation.with, 'arguments.1'), effect: 'transform-props', maxMatches: options.expect,
    }, (context, overwrite) => {
      const call = jsxCallOf(context)
      overwrite(
        call.props.getStart(context.sourceFile),
        call.props.getEnd(),
        `${transform}(${sourceOf(context, call.props)})`,
      )
    })
  }
  if (operation.kind === 'remove') {
    return sourcePatch(options, select, undefined, (context, overwrite) => {
      const call = jsxCallOf(context)
      overwrite(call.call.getStart(context.sourceFile), call.call.getEnd(), 'null')
    })
  }
  throw new Error('dsh-harmony-react: unknown element operation')
}

export function component(options: ComponentPatchOptions): HarmonySourcePatch {
  const select = componentSelector(options.select)
  const operation = options.operation
  if (typeof operation !== 'object' || operation === null
    || operation.kind !== 'decorate' && operation.kind !== 'replace') {
    throw new Error('dsh-harmony-react: unknown component operation')
  }
  const reference = clientReference(operation.with, 'operation.with')
  const trace: HarmonySourceTrace | undefined = 'name' in options.select
    ? {
        select: elementSelector({ component: options.select.name }),
        effect: operation.kind === 'decorate' ? 'decorate-component' : 'replace-component',
        maxMatches: Number.MAX_SAFE_INTEGER,
      }
    : undefined
  return sourcePatch(options, select, trace, (context, overwrite) => {
    rewriteComponent(context, overwrite, reference, operation.kind)
  })
}
