# Patch 编写指南

Patch Provider 是一个普通 DSH 插件，通过 `package.json` 声明一个或多个 CommonJS 模块。Harmony 会在目标插件执行前，从当前 Loader profile 发现这些模块。

## Provider 声明

```json
{
  "name": "my-dsh-plugin",
  "dsh": {
    "harmony": {
      "patches": ["./patches/answer.patch.cjs"],
      "after": ["base-patches"],
      "before": ["ui-patches"],
      "conflicts": ["legacy-patches"]
    }
  }
}
```

Patch 文件必须使用 CommonJS。一个模块可以导出一个 Patch 声明或声明数组，以便实时 Loader 更新时同步收集。

如果 Provider 本身依赖 Harmony 服务，使用 DSH 已有依赖机制：

```ts
export const inject = ['harmony']
```

或在 Loader 行声明：

```yaml
- id: my-plugin
  inject: [harmony]
```

## 源码 Patch

源码 Patch 选择 TypeScript AST 节点，并通过 MagicString 编辑当前源码：

```js
/** @type {import('dsh-harmony').HarmonyPatch} */
module.exports = {
  id: 'answer-value',
  target: {
    package: 'some-dsh-plugin',
    version: '^1.2.0',
    files: ['lib/index.js'],
  },
  select: 'FunctionDeclaration[name.name="answer"] NumericLiteral',
  expect: 1,
  after: ['base-patches'],
  apply({ node, sourceFile, edit }) {
    edit.overwrite(node.getStart(sourceFile), node.getEnd(), '42')
  },
}
```

`select` 使用 [TSQuery](https://github.com/phenomnomnominal/tsquery)。回调参数包括：

| 字段 | 内容 |
| --- | --- |
| `patch` | 稳定键与 Provider Owner |
| `source` | 所有早期 Patch 产生的源码 |
| `sourceFile` | TypeScript AST |
| `node` | 当前匹配节点 |
| `edit` | 针对当前源码的 [MagicString](https://github.com/Rich-Harris/magic-string) 编辑器 |
| `ts` | TypeScript 命名空间 |

传给 `edit` 的位置都以当前 Patch 收到的源码为准。`files` 是备选包内相对路径，Harmony 使用第一个存在的文件；`version` 是 SemVer 范围；`expect` 要求精确匹配数。

每个 Source Patch 都会解析并选择早期 Patch 产生的源码。Harmony 不会先让所有 Patch 查询同一棵原始 AST，再统一应用编辑；那会让选择器看到过时结构，并产生含糊的源码区间。

## 加载器 Patch

当目标包发布的是 TypeScript，而不是 Node 可以直接从 `node_modules` 执行的 JavaScript 时，使用加载器 Patch：

```js
/** @type {import('dsh-harmony').HarmonyPatch} */
module.exports = {
  id: 'load-published-typescript',
  target: {
    package: 'typescript-only-plugin',
    version: '^1.0.0',
    files: ['index.ts'],
  },
  loader: 'typescript',
}
```

目标文件是绑定与状态检查使用的兼容性锚点。绑定后，Harmony 会在 Node 默认加载器运行前，读取并转译该包内的 `.ts`、`.tsx`、`.mts` 和 `.cts` 模块；其它包仍保持 Node 的默认行为。

如果还需要修改 TypeScript 源码，请另行声明源码 Patch。精确到文件的源码 Patch 会先修改当前模块，加载器 Patch 再转译它以及包内的 TypeScript 依赖。

## 语义 Patch

具名函数声明和类方法可以直接装饰，无需手写 AST 编辑：

```js
module.exports = {
  id: 'answer-after',
  target: {
    package: 'some-dsh-plugin',
    version: '^1.2.0',
    files: ['lib/index.js'],
    function: 'answer',
  },
  operation: 'after',
  handler({ result }) {
    return result + 1
  },
}
```

| 操作 | 行为 |
| --- | --- |
| `before` | 目标执行前运行，可返回替换参数数组 |
| `after` | 目标执行后运行，可替换同步或异步结果 |
| `around` | 通过 `invoke(args?)` 控制下一层是否及如何执行 |
| `replace` | 通过 `invoke(args?)` 替换目标；同一函数只能有一个启用的 Replace |

所有 `before` 按 Patch 顺序执行；`around` 与 `replace` 按顺序形成由外到内的链；所有 `after` 再按 Patch 顺序执行。源码 Patch 与语义 Patch 共享同一全局 Patch 顺序。

语义目标当前要求具名参数，不支持 Generator。处理器在 Node.js 中执行，因此 `lib/client.js` 等浏览器目标必须使用源码 Patch。

## 组合 Patch

多个普通 Patch 必须共享排序、启停和成功失败时，使用组合 Patch：

```js
module.exports = {
  id: 'feature-set',
  after: ['base-patches'],
  patches: [
    {
      id: 'host-part',
      target: { package: 'target-plugin', version: '^1.0.0', files: ['lib/index.js'] },
      select: 'StringLiteral[text="old"]',
      expect: 1,
      apply({ node, sourceFile, edit }) {
        edit.overwrite(node.getStart(sourceFile), node.getEnd(), JSON.stringify('new'))
      },
    },
    {
      id: 'client-part',
      target: { package: 'target-plugin', version: '^1.0.0', files: ['lib/client.js'] },
      select: 'StringLiteral[text="old"]',
      expect: 1,
      apply({ node, sourceFile, edit }) {
        edit.overwrite(node.getStart(sourceFile), node.getEnd(), JSON.stringify('new'))
      },
    },
  ],
}
```

组合 Patch 只有一个稳定键、一个 `patchOrder` 位置和一个启停状态；成员保持声明顺序。Harmony 会预检所有已解析成员目标；任一成员无法绑定或应用时，所有成员都不会提交。组合 Patch 是事务边界，并不表示所有查询都要先在原始源码上批量执行。

## 顺序约束

`before` 和 `after` 指向 Provider 包名，是排序约束而非 npm 或 Cordis 依赖。

- `package.json` 中的 Provider 级规则默认作用于其全部 Patch。
- 单个 Patch 只要定义 `before` 或 `after`，就会覆盖而不是追加 Provider 全局规则。
- 最终全局 `patchOrder` 可以交错不同 Provider 的 Patch。
- 没有用户覆盖时，声明顺序仍是稳定 Tie-breaker。

用户顺序始终有效。自动排序只寻找违反约束最少的顺序，并在多个答案相同时保留现有相对顺序；互相矛盾的规则会保留为警告，而不是引入数值优先级。

修改 Provider 顺序会重新聚合同属 Patch；直接修改 `patchOrder` 则保留精确的跨 Provider 排列。后续 Source Patch 会收到早期 Patch 的输出。

## Provider 冲突

`conflicts` 声明 Provider 不兼容关系，单侧声明即可。只有当前 Loader Tree 中两者都是启用状态的 Patch Provider 时才显示警告。

该警告不会阻止安装、启动、应用、排序或重载。停用任一 Provider 的 `<provider>/*` 后警告消失。

## 最小 WebUI 示例

下面的 Patch 替换会话客户端中编译后的新会话标题：

```js
const headline = 'Harmony is All You Need'

module.exports = {
  id: 'home-banner',
  target: {
    package: '@deepseek-ai/dsh-client-ui-conversation',
    version: '0.1.0-rc.6',
    files: ['lib/client.js'],
  },
  select: 'StringLiteral[text="探索未至之境"]',
  expect: 1,
  apply({ node, sourceFile, edit }) {
    edit.overwrite(node.getStart(sourceFile), node.getEnd(), JSON.stringify(headline))
  },
}
```

![Harmony 修改后的 WebUI 新会话主横幅](/webui-banner-example.jpg)

## 服务与工具 API

插件可以注入 `harmony` 服务：

```ts
export const inject = ['harmony']

export function apply(ctx) {
  const snapshot = ctx.harmony.inspect({ package: 'some-dsh-plugin' })
}
```

服务提供 `binEntry`、`profileDir`、`inspect(input?)`、`inspectDependencies(owner)` 和 `reloadPlugin(name)`；后者用于以事务方式重载一个 Loader 插件及其 Patch 声明。包还导出扩展发现工具及其 TypeScript 类型。Preview 与 Draft 生命周期 API 属于 WebUI Studio，而不是 Harmony。
