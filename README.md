<p align="center"><strong>简体中文</strong> | <a href="./README.en.md">English</a></p>

<p align="center">
  <img src="./assets/harmony-icon.png" alt="dsh-harmony" width="180"><br>
  <strong>dsh-harmony</strong><br>
  一个在运行时修补、替换和装饰<br>
  DeepSeek Harness 插件的库。
</p>

## 插件定位

**dsh-harmony 是 DeepSeek Harness 的运行时 Patch 协调层。** 官方插件 API 负责
“增加能力”，Harmony 负责“修改已经存在的能力”：一个插件可以在另一个插件加载前
改写它的实现、替换函数或包裹调用，而不需要维护 Fork，也不会改动磁盘上的安装文件。

| 方式 | 适合做什么 | 边界与代价 |
| --- | --- | --- |
| 官方插件 API | 注册官方开放的服务、Slot、工具和页面 | 无法修改未开放扩展点的内部实现 |
| 维护 Fork | 任意改动目标插件源码 | 需要持续合并上游更新，多个 Fork 难以协调 |
| **dsh-harmony** | 在运行时 Patch Host 与 WebUI 插件 | Patch 需要跟随目标插件的编译结构变化 |

它不是新的插件安装器，也不替代 Harness Loader。它保留原来的 `dsh` 命令和官方
插件装配流程，只在 Loader 执行插件前收集、排序并应用 Patch。设计灵感来自 C# 和
.NET 生态的 [Harmony](https://github.com/pardeike/Harmony)。

## 特性

- 🧩 **源码 Patch**：用 TypeScript AST 精确修改 `lib/index.js` 或 WebUI 的
  `lib/client.js`，目标插件执行前即生效
- 🎯 **语义 Patch**：对具名函数声明和类方法执行 `before`、`after`、`around`、
  `replace`，无需手写整段 AST 变换
- 🔀 **全局协调**：所有提供者共享一个手动顺序，并可声明 `before` / `after` 约束；
  自动排序会寻找违规最少的顺序
- ♻️ **事务热更新**：新增插件、修改 Patch、调整顺序和启停 Patch 都先预检，再热重载
  受影响的 Loader 条目或 WebUI bundle；失败时保留旧代
- 🧯 **冲突可见**：匹配数异常、两个 `replace` 争用同一函数、前序 Patch 移除后序目标
  等错误会指出提供者、目标文件和冲突关系
- 🧼 **不污染安装目录**：变换仅存在于运行时；卸载 Harmony 后，官方 `dsh` 和所有
  目标插件立即回到原始实现

## 最短示例：修改 WebUI 主横幅

官方 WebUI 没有为新会话主横幅提供独立 Slot，并且同一 locale namespace 不能由普通
插件重复注册，因此无法通过官方插件 API 单独覆盖“探索未至之境”。下面这个最小插件
可以为其开启一个 Slot，变成可编辑项。

<p align="center">
  <img src="./assets/webui-banner-example.jpg" alt="Harmony 修改后的 WebUI 新会话主横幅" width="760">
</p>

```text
banner-demo/
├── package.json
├── harmony.patch.yml
├── index.js
└── banner.patch.cjs
```

`package.json`：

```json
{
  "name": "dsh-banner-demo",
  "version": "0.0.0",
  "dsh": {
    "bundle": { "patch": "./harmony.patch.yml" },
    "harmony": { "patches": ["./banner.patch.cjs"] }
  },
  "peerDependencies": { "dsh-harmony": "^0.1.1" }
}
```

`harmony.patch.yml` 把插件加入 Loader Tree，并声明它依赖 Harmony：

```yaml
- insert:
    - id: banner-demo
      name: dsh-banner-demo
      inject: [harmony]
```

`index.js` 只需要提供一个普通的 Harness 插件入口：

```js
exports.apply = () => {}
```

`banner.patch.cjs` 是实际的 Patch：

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
    edit.overwrite(
      node.getStart(sourceFile),
      node.getEnd(),
      JSON.stringify(headline),
    )
  },
}
```

先按下文安装 Harmony，再安装示例插件。命令仍然保持原样；Harmony 会在插件加入运行中
的 Loader Tree 时预检并热更新 WebUI：

```sh
dsh plugin --profile web add ./banner-demo
dsh web
```

## 安装

### 环境要求

| 组件 | 支持版本 |
| --- | --- |
| Node.js | `^22.22.3` 或 `>=24.11.1` |
| DeepSeek Harness | `@deepseek-ai/dsh@0.1.0-rc.6` |
| 操作系统 | Windows、macOS 或 Linux |

### 全局启动器

这是推荐的安装方式。先安装官方 CLI，再安装 Harmony：

```sh
npm install -g @deepseek-ai/dsh@0.1.0-rc.6
npm install -g dsh-harmony
dsh web
```

Harmony 会用一个小型、持久的 shim 替换全局命令入口。所有平台都使用同一个
JavaScript 启动器；macOS 和 Linux 将它暴露为 `dsh` 可执行文件，Windows 则会
增加命令提示符和 PowerShell 使用的原生 `dsh.cmd` 与 `dsh.ps1` 入口。Harmony
安装运行时 Hook 后会继续启动官方 CLI，因此已有命令不需要改变：

```sh
dsh web
dsh --profile tui
dsh plugin --profile web add ./my-plugin
```

在 WebUI 中打开 **设置 → Harmony**，或运行 `dsh harmony`，即可确认运行时已经激活。

### Host 与 WebUI 连接

Harmony 不代理 WebUI 流量，也不保存第二个后端地址。官方 WebUI 由当前
`dsh web` Host 提供，并始终使用页面同源的 `/api` 和 WebSocket。全局命令的路径是：

```text
dsh shim -> dsh-harmony/bin -> @deepseek-ai/dsh -> WebUI + /api
```

Desktop 接入时只需把可配置的 Host 入口指向 `dsh-harmony/bin`，并将 Harmony 与
内置 `@deepseek-ai/dsh` 放在同一 Node 依赖树。Harmony 从自己的 peer dependency 解析官方
CLI，安装 Hook 后传递原始参数。这个路径不会安装或修改系统全局 `dsh` shim。
详细职责边界见 [安装与使用指南](./docs/usage.zh-CN.md#连接模型)。

### 先安装插件

Harmony 同时也是一个普通的 Harness bundle，可以通过已有的插件命令发现并安装：

```sh
dsh plugin --profile web add dsh-harmony
dsh web
```

第一次启动时选择 **安装并重启**。Harmony 会安装全局启动器，平滑关闭当前进程，
在启用运行时 Patch 的情况下重启同一个 profile，并在新进程就绪后刷新 WebUI。

每次启动都会在 Harness 插件加载前，收集所选 profile 已安装依赖中声明的所有
Patch。后续 Loader 更新发现的新 Patch 提供者也会立即被收集，其目标条目会重新
加载。重新加载的 generation 会沿目标包内的相对导入传播，使入口和内部 ESM
依赖图使用同一组 Patch。CommonJS 入口会在重新加载前使同一包内的 `require`
依赖图失效。

## 文档

- [安装与使用指南](./docs/usage.zh-CN.md)
- [Patch 声明和 API](#声明-patch)
- [Patch 排序与检查](#patch-顺序)
- [GitHub Issues](https://github.com/CH4ACKO3/dsh-harmony/issues)

## Patch 顺序

在 `dsh web` 中打开 **设置 → Harmony → 插件排序**。该页面会同步当前 Loader
Tree，包括没有声明 Harmony Patch 的普通插件。可以拖动条目排序，也可以用方向键
选择插件，再用 Alt+方向键移动所选条目。按住条目时，列表仍然支持原生滚轮滚动。
`dsh-harmony` 会固定在列表顶部。Harmony 激活时，官方设置对话框的所有页面都会
加宽。保存会持久化当前 profile 的顺序，并重新加载受影响的 Patch 目标。存在未保存
的调整时，关闭设置或切换页面会询问是保存、放弃，还是继续编辑。

打开 Web profile 的 Harmony TUI：

```sh
dsh harmony
```

可用 `--profile <name>` 指定其他 profile。方向键选择插件，`u` 和 `d` 移动，`a`
计算违反约束最少的顺序，`r` 同步已安装插件列表，`q` 退出。每次移动都会立即保存。
Web profile 正在运行时，TUI 会把候选顺序发送给该进程进行预检和热重载；否则会在
修改 `harmony.json` 前进行本地预检。新安装的插件会自动追加到列表末尾，卸载的插件
会自动移除。

相邻的 **Patch 状态** 页面会显示每个稳定 Patch ID、目标、绑定状态、匹配数量、
generation 和错误。可以在这里禁用或启用 Patch；该变更与排序共用同一套预检和
热重载事务。终端检查命令如下：

```sh
dsh harmony status
dsh harmony inspect some-dsh-plugin --file lib/index.js
```

`inspect` 会打印原始源码、每次 Patch 后的中间结果和最终变换结果，不会修改已安装
的包。

运行时会同时监听 `package.json` 和 `harmony.json`。提供者集合或顺序变化时，受影响
的 Loader 分组会使用完整 Patch 集重建，而磁盘源码保持不变。顺序保存、启用或禁用、
提供者文件更新和 Loader Tree 变化共用同一个串行事务队列，因此失败事务的回滚不会
覆盖更新的已提交变更。

目标文件为 `lib/client.js` 时，会改用 Harness 自己的 `clientModules.rebuilt` 路径。
它会重新计算变换后 bundle 的 revision，并发送现有 HMR 事件，因此已经打开的 WebUI
只会重载发生变化的客户端插件。

## 声明 Patch

在 Patch 提供插件的 `package.json` 中加入 Patch 文件：

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

Patch 文件使用 CommonJS 模块，这样 Node 的同步模块加载器可以在插件实时更新期间
收集它们：

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
  apply({ node, sourceFile, edit }) {
    edit.overwrite(node.getStart(sourceFile), node.getEnd(), '42')
  },
}
```

选择器使用 [TSQuery](https://github.com/phenomnomnominal/tsquery)。回调会收到匹配的
TypeScript AST 节点和 [MagicString](https://github.com/Rich-Harris/magic-string)
编辑器。传给 `edit` 的所有位置都以该 Patch 收到的源码为基准，其中包括先前提供者
产生的修改。`files` 列出可选的包内相对路径，将使用第一个存在的文件；`version`
是 semver 范围；`expect` 要求选择器的匹配数量完全一致。

对于具名函数声明和类方法，语义 Patch 可以装饰调用，而不必直接写 AST 修改：

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

可用操作包括 `before`、`after`、`around` 和 `replace`。`before` 可以返回一组替换
参数；`after` 可以替换同步或异步结果；`around` 和 `replace` 会收到
`invoke(args?)`。同一函数存在两个已启用的 `replace` Patch 时会报告冲突。语义目标
目前接受具名参数，不支持生成器。Handler 在 Node 进程中执行，因此浏览器端的
`lib/client.js` 目标仍使用源码 Patch。所有 `before` Handler 按 Patch 顺序运行，
`around`/`replace` Handler 按 Patch 顺序组成由外到内的调用链，所有 `after`
Handler 也按 Patch 顺序运行。源码 Patch 和语义 Patch 共用同一个全局顺序，不会
被拆分为不同阶段。

`before` 和 `after` 属于提供者的 `dsh.harmony` 声明，引用其他 Patch 提供者的包名。
它们是排序约束，而不是 npm 或 Cordis 依赖。手动列表始终是最终依据；TUI 会高亮
违反的约束，自动排序则会寻找违规最少的顺序，并在结果并列时保持现有顺序。

`conflicts` 同样引用其他 Patch 提供者的包名，但只表达不兼容告警。单方面声明即可；
只有双方都是当前 Loader Tree 中启用的 Harmony Patch 提供者时才会显示。它不会阻止
安装、启动、排序保存、Patch 应用或热重载，也不参与自动排序。通过 `<provider>/*`
停用任意一方后，该条告警会消失。

每个提供者内部的 Patch 按声明顺序运行，提供者按 profile 的手动顺序运行，每个后续
Patch 都会收到先前 Patch 产生的源码。如果较早的提供者删除了后续提供者所选择的
代码，错误会同时指出两个提供者、目标文件和选择器。

相同机制同时适用于 `lib/index.js` 等宿主 bundle 和 `lib/client.js` 等浏览器 bundle。

由于 Harmony 使用 Node 的同步 CommonJS 和 ESM 模块 Hook 作为同一条变换路径，
因此要求 Node.js 22.x 中的 `22.22.3+`，或 `24.11.1+`。

## 限制

- Patch 提供者文件必须使用 CommonJS 模块，以便 Loader 实时更新时同步收集。
- 语义 Patch 只能以具名函数声明和类方法为目标；参数必须是具名标识符，并且不支持
  generator。
- 语义 Handler 在 Node.js 中运行。`lib/client.js` 等浏览器目标必须使用源码 Patch。
- 两个已启用的 `replace` Patch 不能指向同一个函数，否则事务会以冲突拒绝提交。
- 源码选择器依赖目标插件编译后的代码结构，目标插件变化后可能需要更新选择器。

## 依赖 Harmony

启动器会加入一个提供 `harmony` 服务的普通 Cordis 插件。其他插件可以直接使用
Harness 现有的依赖机制：

```ts
export const inject = ['harmony']

export function apply(ctx) {
  // dsh-harmony is active when this plugin starts.
}
```

也可以在 Loader 条目上声明依赖：

```yaml
- id: my-plugin
  inject: [harmony]
```

Harmony 永远不会把变换后的源码写回其他插件。只要 Harmony 仍然安装，它的命令 shim
就会启用 Harmony；Harmony 被移除后，shim 会立即回退到已有的官方 CLI。请先移除
profile bundle，再移除全局运行时；如果先移除了运行时，残留的 profile 插件会在
下次启动时提供 **移除插件** 选项：

```sh
dsh plugin --profile web remove dsh-harmony
npm uninstall -g dsh-harmony
dsh web
```

## 反馈

请通过 [GitHub Issues](https://github.com/CH4ACKO3/dsh-harmony/issues)
报告 Bug、Patch 冲突和功能建议。

## 许可证

dsh-harmony 使用 [MIT License](./LICENSE)。

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-harmony"><img src="https://img.shields.io/npm/v/dsh-harmony.svg?style=flat-square&label=npm" alt="npm version"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/dsh-harmony.svg?style=flat-square&label=License" alt="MIT License"></a>
  <a href="./docs/usage.zh-CN.md"><img src="https://img.shields.io/badge/Documentation-Guide-4b8bbe?style=flat-square" alt="Documentation"></a>
</p>
<p align="center">
  <a href="https://www.npmjs.com/package/dsh-harmony"><img src="https://img.shields.io/npm/dm/dsh-harmony.svg?style=flat-square&label=Downloads" alt="npm downloads"></a>
  <a href="https://github.com/CH4ACKO3/dsh-harmony/actions/workflows/ci.yml"><img src="https://github.com/CH4ACKO3/dsh-harmony/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>
<p align="center">
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-22.22.3%2B%20%7C%2024.11.1%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 22 or 24"></a>
  <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/DSH-0.1.0--rc.6-1f6feb?style=flat-square" alt="DeepSeek Harness 0.1.0-rc.6"></a>
</p>
