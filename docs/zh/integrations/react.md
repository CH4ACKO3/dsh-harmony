# React Patch

`dsh-harmony-react` 提供 React-aware 工厂，并返回普通 `HarmonySourcePatch` 声明。它理解编译后的 `jsx` 与 `jsxs` 调用；发现、排序、验证、事务、检查和浏览器 HMR 仍由 Harmony 负责。

```sh
npm install dsh-harmony-react
```

它是 Node 侧辅助库，不是新的 DSH 插件或客户端运行时。下游 Patch Provider 仍是唯一插件。

## 包结构

需要插入浏览器代码的 Provider 通常包含：

- CommonJS Patch 声明；
- 立即预取的浏览器 Bundle，用于导出替换组件或函数；
- 最小 DSH 入口，让包出现在 Loader Tree 中。

```json
{
  "dsh": {
    "client": {
      "immediately": true,
      "platform": "web"
    },
    "harmony": {
      "patches": ["./patch.cjs"]
    }
  }
}
```

立即预取保证插入到其他客户端模块中的同步 `require()` 能解析 Provider 的浏览器导出。

## Element：修改选中的调用点

修改只应在选定渲染位置生效时，使用 `element()`：

```js
const { element } = require('dsh-harmony-react')

module.exports = element({
  id: 'custom-sidebar-brand',
  target: {
    package: '@deepseek-ai/dsh-client-ui-sidebar',
    version: '0.1.0-rc.6',
    files: ['lib/client.js'],
  },
  select: { component: 'BrandWordmark' },
  expect: 1,
  operation: {
    kind: 'replace',
    with: { module: 'my-harmony-plugin', export: 'CustomBrand' },
  },
})
```

生成的 Patch 会替换组件类型，同时保留原有 Props 与 Key。Element 操作包括：

| `operation.kind` | 结果 |
| --- | --- |
| `replace` | 替换组件类型 |
| `wrap` | 包裹选中的 Element，并把它作为 `children` |
| `insert-before` / `insert-after` | 在选中 Element 外创建包含两个子节点的 Fragment |
| `transform-props` | 通过浏览器侧函数变换当前 Props |
| `remove` | 用 `null` 替换选中的 Element |

客户端 Props Transformer 是普通函数，不是 React 组件，不能调用 Hook。需要 Hook 时使用 Wrapper 或 Replacement Component。

## Component：修改共享定义

所有通过同一组件绑定进行的调用都应看到修改时，使用 `component()`：

```js
const { component } = require('dsh-harmony-react')

module.exports = component({
  id: 'decorate-button',
  target: {
    package: '@deepseek-ai/dsh-client-ui-buttons',
    version: '0.1.0-rc.6',
    files: ['lib/client.js'],
  },
  select: { name: 'Button' },
  expect: 1,
  operation: {
    kind: 'decorate',
    with: { module: 'my-harmony-plugin', export: 'withFeature' },
  },
})
```

`decorate` 通过浏览器侧高阶函数包裹当前定义；`replace` 用指定导出替换当前定义。名称选择器支持：

- 带 initializer 的 `VariableDeclaration`；
- 带函数体的具名 `FunctionDeclaration`。

::: warning 函数声明提升
Harmony 会把匹配的函数声明改写为已初始化的 `const`，从而让后续 Component Patch 按最终 Patch 顺序继续装饰或替换同一绑定。生成绑定不具有声明提升；目标在声明前读取组件时，请使用核心 Source Patch。Harmony 不会让这些早期调用静默绕过装饰。
:::

需要修改组件函数体、字符串字面量或其它任意语法节点时，使用核心 Source Patch。

## 选择器与组合

Element 选择器可以指向局部或成员组件名、原生标签或原始 TSQuery。原始 Element TSQuery 必须直接选中编译后的 `jsx` / `jsxs` `CallExpression`。

Component 选择器支持 `{ name }` 或原始 TSQuery。原始 Component TSQuery 必须直接选中已初始化变量声明或具名函数声明。

每个 React Patch 都要求：

- 显式目标包、版本和文件列表；
- 精确 `expect` 数量；
- 稳定 Patch `id`。

Harmony 会让每个 React Patch 继续处理早期 Patch 产生的源码，因此兼容的装饰、替换与 Props 变换按全局最终 `patchOrder` 组合。React 不引入第二套排序模型。同一个 Patch 会拒绝范围重叠的嵌套编辑；父子修改应拆成多个具有明确顺序的 Patch。

## Inspect trace

Element 工厂会为支持的操作生成 Preview trace。基于名称的 Component 选择器也会在引用该绑定的编译 JSX 调用点上生成 `decorate-component` 或 `replace-component` 候选 trace。

原始 Component TSQuery 仍可正常应用，但不会生成调用路径 trace，因为任意 AST 选择器无法可靠推断绑定名称。Trace 表示候选渲染路径，并不证明精确节点作者；目标级变换源码仍可通过 `dsh harmony inspect` 查看。

完整 Provider 与浏览器 Bundle 见[可运行的 Rebrand 示例](https://github.com/memorax-ai/dsh-harmony/tree/main/packages/react/examples/rebrand-plugin)。
