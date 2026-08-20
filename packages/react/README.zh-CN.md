# dsh-harmony-react

[English](./README.md) | 简体中文

面向 [dsh-harmony](https://github.com/memorax-ai/dsh-harmony) 的 React 源码 Patch 工厂。

该包是运行在 Node 侧的 Harmony 扩展，不是 DSH 客户端运行时。它把 React Element 和 Component 操作转换为普通的 `HarmonySourcePatch` 声明；Patch 发现、排序、校验、事务和 WebUI 热更新仍由 Harmony 负责。

## 架构

下游包是唯一的 DSH 插件，包含 Harmony Patch Provider、立即预取并导出 React 组件的客户端 bundle，以及用于出现在 Loader Tree 中的最小 DSH 入口。

`dsh-harmony-react` 只是该 Provider 的依赖，不会注册第二个 DSH 插件。可选的 `dsh-harmony-react/studio` 浏览器 API 仅在 Studio Preview 中委托给注入的注册表，在普通 `dsh web` 会话中注册操作为空操作。Studio Host 使用独立的 `dsh-harmony-react/studio-host` 集成契约；Patch Provider 不应导入这个仅供 Host 使用的入口。

## 示例

```js
const { element } = require('dsh-harmony-react')

module.exports = element({
  id: 'custom-sidebar-brand',
  target: {
    package: '@deepseek-ai/dsh-client-ui-sidebar',
    version: '0.1.0-rc.7',
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

生成的 Patch 会替换现有 JSX 调用中的组件类型，并保留 props 和 key。由于注入的同步 `require()` 需要立即解析客户端模块，下游包必须声明客户端 bundle 为立即预取：

```json
{
  "dsh": {
    "client": { "immediately": true, "platform": "web" },
    "harmony": { "patches": ["./patch.cjs"] }
  }
}
```

## Element 与 Component Patch

`element()` 用于一个或多个明确的编译后 `jsx`/`jsxs` 调用点，支持 `replace`、`wrap`、`insert-before`、`insert-after`、`transform-props` 和 `remove`。变更只影响匹配的调用点。

`component()` 用于修改带初始化值的变量或具名函数声明所定义的组件 binding。`decorate` 使用浏览器侧高阶函数包装当前定义，`replace` 则替换定义；所有读取该 binding 的调用点都会看到结果。

```js
const { component } = require('dsh-harmony-react')

module.exports = component({
  id: 'decorate-button',
  target: {
    package: '@deepseek-ai/dsh-client-ui-buttons',
    version: '0.1.0-rc.7',
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

Component selector 必须直接匹配带初始化值的 `VariableDeclaration`，或带函数体的具名 `FunctionDeclaration`。函数声明会被重写为初始化的 `const` binding，因此被 Patch 的函数组件不得在声明前读取；如目标依赖函数提升，或需要修改函数体及其他声明形式，请使用核心 Source Patch。

Element selector 可指定局部组件、成员组件、原生标签或原始 TSQuery。原始 Element TSQuery 必须选中编译后的 `jsx`/`jsxs` `CallExpression`；原始 Component TSQuery 必须选中变量或具名函数声明。每个 Patch 都必须提供精确的 `expect`、目标版本和目标文件。若同一个 Patch 的嵌套匹配产生重叠编辑，操作会被拒绝；需要同时修改父子节点时，请拆成显式排序的 Patch。

React Patch 始终基于前序 Patch 产生的源码继续应用，因此兼容的 decorator 和 props 变换会按 Harmony 的最终 Patch 顺序组合。React 不引入第二套排序模型。

基于名称的 Component selector 会为引用该 binding 的 JSX 调用生成 Preview trace 元数据。原始 TSQuery 仍可正常应用，但不会生成调用路径追踪。客户端 props transformer 是普通函数，不能调用 Hook；需要 Hook 时应使用 wrapper 或 replacement 组件。

## Studio Element

Studio 只显示 Draft 显式注册的子树与变量。通过相同的 `surfaceId` 和路径，把注册项关联到 `dsh-ui-container` 的 `SurfaceHost` 或 `SurfaceBoundary`：

```ts
import { registerStudioElement } from 'dsh-harmony-react/studio'

let accent = '#245fd6'
const listeners = new Set<() => void>()

const dispose = registerStudioElement({
  owner: 'my-harmony-plugin',
  element: {
    id: 'settings-card',
    label: 'Settings card',
    boundary: { surfaceId: 'settings', path: ['appearance', 'card'] },
    source: { file: 'src/SettingsCard.tsx', line: 12 },
    variables: [{
      kind: 'group',
      id: 'appearance',
      label: 'Appearance',
      children: [{ kind: 'variable', id: 'accent', label: 'Accent', control: 'color' }],
    }],
  },
  bindings: {
    accent: {
      get: () => accent,
      set(value) {
        accent = String(value)
        for (const listener of listeners) listener()
      },
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
  },
})
```

请在客户端插件或组件生命周期结束时调用返回的 disposer。插件级控制项使用 `registerStudioVariables`。源码路径必须是相对于 Draft 的规范化 POSIX 路径。变量 binding 是唯一的实时写入界面：Studio 会串行化更新、调用 `set`，随后在注册表快照中发布 `get()` 的当前值。

`variables` 是树结构，`group` 可以包含变量或嵌套 group。同一次注册中的节点 ID 与变量 ID 必须唯一；binding 只对应 `variable` 节点，并以变量 ID 为键。

要让 Studio 持久化控制项默认值，请在变量定义中添加 `defaultSource`。`before` 和 `after` 必须在 Draft 文件中精确包围一个源码字面量；Studio 只替换锚点之间的文本，并拒绝含糊或非字面量匹配。它修改的是下次加载的默认值，不会替换响应式运行时 binding。

Element boundary 只证明 Draft 拥有所注册的子树契约。工厂生成的 Preview trace wrapper 可以为选中的 React 渲染路径补充候选 Patch 元数据，但不代表精确的节点归属；没有 trace 意图的原始 Source Patch 仍只能通过 Harmony 的目标级检查查看。
