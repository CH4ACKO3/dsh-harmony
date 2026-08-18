# Studio 预览

可选入口 `dsh-harmony-react/studio` 可以让兼容的 [dsh-webui-studio](https://github.com/CH4ACKO3/dsh-webui-studio) Draft 暴露明确的 Element 和可编辑变量。

注册会委托给仅在 Studio Preview 中注入的浏览器 Registry；在普通 `dsh web` 会话中，同样的调用是 No-op。

## 注册 Element

通过相同 `surfaceId` 和 Path，将 Element 关联到 `dsh-ui-container` 的 `SurfaceHost` 或 `SurfaceBoundary`：

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
      children: [{
        kind: 'variable',
        id: 'accent',
        label: 'Accent',
        control: 'color',
        defaultSource: {
          file: 'src/SettingsCard.tsx',
          before: 'const accent = ',
          after: ';',
        },
      }],
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

在客户端插件或组件生命周期中调用返回的 Disposer。对于不属于某个 Element 的全局控制，使用 `registerStudioVariables`。

## Variable Tree 与持久默认值

`variables` 数组是由 `group` 和 `variable` 节点组成的树。Group 可以包含变量或嵌套 Group；同一 Registration 内的节点 ID 与变量 ID 必须唯一。只有叶子变量具有 Binding，并以变量 ID 为键。

`defaultSource` 可选，用于让 Studio 把新的下次加载默认值写入 Draft 源码，而不替换实时 Binding。`before` 与 `after` 必须在标准化、相对 Draft 的文件中恰好包围一个受支持的源码字面量。匹配缺失、存在歧义或不是字面量时，Studio 会拒绝写入。

## 注册约定

- Source Path 使用标准化、相对 Draft 的 POSIX 路径。
- Variable Control 支持 color、length、number、boolean、enum 和 string。
- Binding 是唯一实时写入口：Studio 串行处理更新，调用 `set`，再发布当前 `get()` 值。
- `subscribe` 可选，并返回自己的 Disposer。

## Provider 与 Host API

Patch Provider 从 `dsh-harmony-react/studio` 导入定义、Binding、Registration、`registerStudioElement` 与 `registerStudioVariables`。

Studio 实现只从 `dsh-harmony-react/studio-host` 导入共享注入键和运行时注册契约：

```ts
import { STUDIO_RUNTIME_KEY, type StudioBrowserRuntime } from 'dsh-harmony-react/studio-host'
```

Registry Snapshot、选中状态、Preview Message 与持久化契约属于 Studio 应用自身，不属于 Provider API。这样公共 Provider 接口不会绑定到唯一一个下游 Host 实现。

## Trace 边界

Element Boundary 只能证明 Draft 拥有已注册的子树契约。React 工厂生成的 Preview Trace Wrapper 可以附带候选 Patch 元数据，包括 Owner、Declaration、Target 和 Effect。基于名称的 Component Patch 会在引用该绑定的 JSX 调用点贡献 `decorate-component` 或 `replace-component` trace。

这些信息不代表精确节点作者。其他 Provider 可能 Patch 祖先节点、变换 Props，或贡献没有直接源码对应的节点。原始 Component TSQuery 无法推断绑定名称，因此不会生成调用路径 trace。未声明 Trace Intent 的原始 Source Patch 仍只能通过 Harmony Target Inspection 查看。
