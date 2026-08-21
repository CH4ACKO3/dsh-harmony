# React Patch

`dsh-harmony-react` 把 React 相关的修改要求转换成普通 `HarmonySourcePatch` 声明。它识别编译后的 `jsx` 和 `jsxs` 调用，Harmony 再像处理其它 Source Patch 一样发现、排序、应用、检查和重载它们。

```sh
npm install dsh-harmony-react
```

这个包运行在 Node 侧，既不是 DSH 插件，也不是浏览器运行时。需要安装的插件只有 Patch Provider。

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

立即预取会提前准备好 Provider 的浏览器导出，让 Harmony 插入目标 Client Module 的同步 `require()` 能够找到它。

## Element：修改选中的调用点

修改只应在选定渲染位置生效时，使用 `element()`：

```js
const { element } = require('dsh-harmony-react')

module.exports = element({
  id: 'custom-sidebar-brand',
  target: {
    package: '@deepseek-ai/dsh-client-ui-sidebar',
    version: '0.1.0-rc.8',
    file: 'lib/client.js',
  },
  select: { component: 'BrandWordmark' },
  expect: 1,
  operation: {
    kind: 'replace',
    with: { module: 'my-harmony-plugin', export: 'CustomBrand' },
  },
})
```

这个 Patch 会替换组件类型，并保留原有 Props 和 Key。`element()` 支持：

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
    version: '0.1.0-rc.8',
    file: 'lib/client.js',
  },
  select: { name: 'Button' },
  expect: 1,
  operation: {
    kind: 'decorate',
    with: { module: 'my-harmony-plugin', export: 'withFeature' },
  },
})
```

`decorate` 把当前定义传给浏览器侧高阶函数，`replace` 则改用指定导出。名称选择器可以匹配：

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

React Patch 会读取早期 Patch 留下的源码，并和其它 Source Patch 共用全局 `patchOrder`。父节点和子节点的修改应拆成两个有先后关系的 Patch，因为同一个 Patch 不接受源码范围重叠的编辑。

## Inspect trace

Element 工厂会为支持的操作记录 Preview trace。按名称选择 Component 时，Harmony 还会在使用该绑定的编译后 JSX 调用上标记 `decorate-component` 或 `replace-component`。

原始 Component TSQuery 仍可应用，但 Harmony 无法从任意 AST 选择器推断绑定名称，所以不会记录调用路径 trace。Trace 只指出可能的渲染路径，不能证明每个节点由哪个 Patch 创建。要查看目标修改后的源码，请使用 `dsh harmony inspect`。

完整 Provider 与浏览器 Bundle 见[可运行的 Rebrand 示例](https://github.com/memorax-ai/dsh-harmony/tree/main/packages/react/examples/rebrand-plugin)。
