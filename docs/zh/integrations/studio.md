# Studio 预览

Patch Provider 可以通过可选入口 `dsh-harmony-react/studio`，向兼容的 [dsh-webui-studio](https://github.com/CH4ACKO3/dsh-webui-studio) Draft 描述 Element 和可编辑变量。

Studio Preview 会注入接收这些注册的浏览器 Registry；普通 `dsh web` 会话中，同样的调用不会产生效果。

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

需要让 Studio 把新默认值写入 Draft、供下次加载使用时，再设置 `defaultSource`；实时 Binding 不会因此被替换。在指定的 Draft 相对路径文件中，`before` 和 `after` 必须包围一个受支持的字面量。找不到、找到多个或匹配到非字面量时，Studio 会拒绝写入。

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

Registry Snapshot、选中状态、Preview Message 和持久化由 Studio 应用负责，不属于 Provider API，因此 Provider 不依赖某一种 Studio 实现。

## Trace 表示什么

注册 Element 表示 Draft 拥有这棵子树。React 工厂可以在可能的渲染路径上附加 Owner、Declaration、Target 和 Effect。按名称选择的 Component Patch 会在使用该绑定的 JSX 调用上添加 `decorate-component` 或 `replace-component` trace。

Trace 不能指出每个节点由谁创建。其他 Provider 可能修改祖先节点或 Props，也可能加入没有直接源码对应的节点。原始 Component TSQuery 没有可推断的绑定名称，因此不记录调用路径。没有 Trace 数据的原始 Source Patch 只能在 Harmony Target Inspection 中查看。
