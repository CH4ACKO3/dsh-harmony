# React Patch

`dsh-harmony-react` 把组件级操作转换为普通 `HarmonySourcePatch`，用于修改编译后的 React `jsx` 与 `jsxs` 调用。

```sh
npm install dsh-harmony-react
```

它是 Node 侧辅助库，不是新的 DSH 插件或客户端运行时。你的下游 Provider 仍是唯一插件；发现、排序、验证、事务与 WebUI HMR 继续由 Harmony 负责。

## 包结构

一个下游插件通常包含：

- Harmony Patch Provider；
- 立即预取的浏览器 Bundle，用于导出替换组件；
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

立即预取保证插入到其他客户端模块中的同步 `require()` 能解析你的浏览器导出。

## 替换元素

```js
const { replaceElement } = require('dsh-harmony-react')

module.exports = replaceElement({
  id: 'custom-sidebar-brand',
  target: {
    package: '@deepseek-ai/dsh-client-ui-sidebar',
    version: '0.1.0-rc.6',
  },
  select: { component: 'BrandWordmark' },
  expect: 1,
  with: {
    module: 'my-harmony-plugin',
    export: 'CustomBrand',
  },
})
```

生成的 Patch 会替换组件类型，同时保留原有 Props 和 Key：

```js
(0, react_jsx_runtime.jsx)(
  require('my-harmony-plugin').CustomBrand,
  originalProps,
)
```

## 操作

| 工厂 | 结果 |
| --- | --- |
| `replaceElement` | 替换组件类型，保留 Props 与 Key |
| `wrapElement` | 包裹现有元素，并把它作为 `children` |
| `insertBefore` / `insertAfter` | 插入兄弟元素 |
| `transformProps` | 通过浏览器侧函数变换 Props |
| `removeElement` | 用 `null` 替换元素 |
| `replaceStringLiteral` | 替换精确浏览器字符串字面量 |

选择器可以指向局部组件、成员组件、原生标签或原始 TSQuery。原始 TSQuery 必须选择编译后的 `jsx` / `jsxs` `CallExpression`；如果选中其子节点，`expect` 统计的是语法节点而不是 React 元素。

每个工厂都要求显式目标版本与精确 `expect`。同一个 Patch 会拒绝编辑范围重叠的嵌套匹配；父子元素都要修改时，应拆成有明确顺序的 Patch。

客户端 Props Transformer 是普通函数，不能调用 Hook。需要 Hook 时使用 Wrapper 或 Replacement Component。

完整包结构见[可运行的 Rebrand 示例](https://github.com/CH4ACKO3/dsh-harmony/tree/main/packages/react/examples/rebrand-plugin)。
