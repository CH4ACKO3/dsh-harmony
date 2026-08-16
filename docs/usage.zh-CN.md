# 安装与使用指南

<p><a href="./usage.md">English</a> | <strong>简体中文</strong> | <a href="../README.zh-CN.md">README</a></p>

本文介绍安装、首次启动、profile 选择、Patch 排序、检查、更新和卸载。文末提供
Patch 开发入门，完整 API 示例仍放在项目 README 中。

## 选择安装方式

| 方式 | 适用场景 | 最终效果 |
| --- | --- | --- |
| 全局启动器 | 可以管理本机环境，希望立即启用 Harmony | `dsh` 先启动 Harmony，再启动官方 CLI |
| 先安装插件 | 通过 DSH 插件流程发现了 Harmony | bundle 会在首次启动时安装全局启动器 |

两种方式最终使用相同的运行时，已有 `dsh` 命令的名称和参数都不会改变。

## 环境要求

- Node.js 22.x 中的 `22.22.3+`，或 `24.11.1+`
- `@deepseek-ai/dsh@0.1.0-rc.6`
- Windows、macOS 或 Linux

安装前检查 Node：

```sh
node --version
npm --version
```

## 安装全局启动器

先安装支持的官方 Harness 版本，再安装 Harmony：

```sh
npm install -g @deepseek-ai/dsh@0.1.0-rc.6
npm install -g dsh-harmony
```

正常启动 Web profile：

```sh
dsh web
```

Harmony 安装程序会替换全局 `dsh` 入口，但保留原命令名。shim 先加载 Harmony 的
CommonJS 和 ESM 变换 Hook，再将原始参数交给官方 CLI。Windows 会生成 `dsh.cmd`
和 `dsh.ps1`；macOS 和 Linux 使用 `dsh` 可执行文件。

可以通过下面任一方式确认安装：

```sh
dsh harmony
dsh harmony status
```

`dsh harmony` 会打开 Web profile 的排序 TUI。WebUI 中的 Harmony 位于
**设置 → Harmony**。

## 连接模型

| 组件 | 职责 | 不负责 |
| --- | --- | --- |
| Harmony | 在官方 CLI 运行前安装 Patch Hook，再传递原始参数 | 不启动第二个 Host，不代理 WebUI 流量 |
| DSH Host | 提供 WebUI 静态资源、`/api` HTTP RPC 和 WebSocket | 不从另一个 DSH Host 读取会话 |
| WebUI | 使用 `window.location.origin` 连接当前 Host 的 `/api` | 不选择另一个后端地址 |
| Desktop | 启动一个本地 Host，读取 readiness URL，再用 BrowserWindow 打开该 URL | 不重写 WebUI 或 Harness 协议 |

全局 CLI 安装时的单一路径：

```text
系统 dsh 命令
  -> Harmony shim
  -> dsh-harmony/bin
  -> @deepseek-ai/dsh/lib/bin.js
  -> dsh web Host
  -> 同源 WebUI + /api + WebSocket
```

Harmony 的 postinstall 独立创建初始 shim 和 bootstrap 状态；bootstrap 插件只在官方 DSH
升级覆盖 shim 后恢复它。Harmony 运行时不再重复写入这些文件，只从自己的
`@deepseek-ai/dsh` peer dependency 解析官方 CLI。

### Desktop 接入

当 Desktop 支持可配置 Host 入口后，将该入口指向公开导出 `dsh-harmony/bin`。如果
`dsh-harmony` 与内置 `@deepseek-ai/dsh` 位于不同 Node 依赖树，再将内置 CLI 的绝对路径
写入 `DSH_HARMONY_DSH_ENTRY`：

```text
Desktop supervisor
  -> dsh-harmony/bin
  -> @deepseek-ai/dsh/lib/bin.js web --host 127.0.0.1 --port 0
  -> readiness URL
  -> BrowserWindow
```

Desktop 仍然拥有 Node 可执行文件、Host 子进程、工作目录、退出处理和 readiness 协议；
Harmony 读取指定的 DSH 入口、安装 Hook，再导入该入口。未设置
`DSH_HARMONY_DSH_ENTRY` 时，Harmony 从自己的 peer dependency 解析 DSH。因为不经过
全局安装，该路径不会写入或修改系统 `dsh` 命令。
当前上游 Desktop 仍直接启动内置官方 CLI，因此在它提供可配置 Host 入口之前，全局安装
Harmony 不会影响 Desktop。

## 通过 `dsh plugin` 安装

这种方式从已经可用的官方 `dsh` 开始：

```sh
dsh plugin --profile web add dsh-harmony
dsh web
```

安装后的 bundle 会检测 Harmony 启动器尚未激活，并询问如何继续：

| 选项 | 行为 |
| --- | --- |
| 安装 | 安装全局启动器并退出当前进程，等待用户再次运行 `dsh` |
| 安装并重启 | 安装启动器，并立即重启相同命令和 profile |
| 移除插件 | 从当前 profile 中移除 `dsh-harmony` |
| 本次忽略 | 本次启动不激活 Harmony 运行时，继续运行 |

在 WebUI 中选择 **安装并重启** 后，页面会在重启后的进程就绪时刷新。交互式终端
profile 会用编号菜单显示相同的四个选项。

其他插件可以声明 `inject = ['harmony']`。在重启后的进程加载 Harmony 模块 Hook
以前，`harmony` 服务不会存在，因此依赖 Harmony 的插件不会在尚未修补的进程中启动。

## 继续使用普通 DSH 命令

Harmony 不会引入第二个启动器名称，已有 CLI 保持不变：

```sh
dsh web
dsh --profile tui
dsh plugin --profile web add some-plugin
dsh plugin --profile web remove some-plugin
```

当前 profile 决定 Harmony 会发现哪些已安装的 Patch 提供者和目标。`dsh harmony`
默认使用 `web` profile，其他 profile 需要显式指定名称：

```sh
dsh harmony --profile tui
dsh harmony status --profile tui
dsh harmony inspect target-plugin --file lib/index.js --profile tui
```

每个 profile 会把独立的排序和已禁用 Patch ID 保存在
`$DSH_HOME/profiles/<name>/harmony.json`。

## 在 WebUI 中排序插件

启动 WebUI，然后打开 **设置 → Harmony → 插件排序**：

```sh
dsh web
```

列表包含当前 Loader Tree 中的所有插件。没有 Harmony Patch 的普通插件也会显示，
以便页面与已安装 profile 保持同步；只有 Patch 提供者的相对位置会影响 Patch
应用顺序。

- 拖动条目即可移动；按住条目时仍然可以用滚轮原生滚动列表。
- 可以用方向键选择条目，再用 Alt+方向键移动。
- `dsh-harmony` 永远固定在顶部。
- 排序变化后 **保存** 按钮才会激活。
- 保存会先对完整 Patch 集进行预检，再提交并热重载。
- 存在未保存顺序时，关闭设置或切换页面会询问是保存、放弃还是继续编辑。

新安装的插件会自动追加，已卸载的插件会从保存的顺序中移除。

## 在 TUI 中排序插件

打开 Web profile 的 TUI：

```sh
dsh harmony
```

其他 profile 使用 `dsh harmony --profile <name>`。

| 按键 | 操作 |
| --- | --- |
| 上 / 下方向键或 `k` / `j` | 选择插件 |
| `u` / `d` | 将所选插件上移或下移 |
| `a` | 寻找违反 `before`/`after` 约束最少的顺序 |
| `r` | 与当前 profile 已安装依赖同步 |
| `q`、Escape 或 Ctrl+C | 退出 |

每次移动都会立即保存。如果所选 profile 正在运行，TUI 会把候选顺序发送给该进程
进行预检和热重载；否则会在修改 `harmony.json` 前，在本地执行同样的预检。

手动顺序始终是最终依据。自动排序会尽量减少未满足的约束，并在多个结果并列时保持
现有顺序；插件依赖不会自动变成 Patch 顺序约束。

## 检查 Patch 状态

列出 Web profile 的全部 Patch：

```sh
dsh harmony status
```

使用 `--profile` 选择其他 profile：

```sh
dsh harmony status --profile tui
```

每一行都包含 Patch 状态、稳定的 `provider/id` 键、目标包和目标文件。状态包括：

| 状态 | 含义 |
| --- | --- |
| `pending` | 已收集，但尚未绑定到已经加载的目标 |
| `bound` | 已应用到当前目标 generation |
| `disabled` | 已在当前 profile 的 Harmony 状态中禁用 |
| `failed` | 收集、目标解析、匹配或应用失败 |

存在任意失败 Patch 时，`status` 会以状态码 `1` 退出，因此可以用于发布或 CI 检查。
失败输出会包含 Patch 键和目标详情。

WebUI 的 **设置 → Harmony → Patch 状态** 会显示相同信息，以及匹配数量和
generation。在此启用或禁用 Patch，会使用与排序相同的事务性预检和热重载流程。

## 检查变换后的源码

检查一个目标包和文件：

```sh
dsh harmony inspect some-dsh-plugin --file lib/index.js
```

输出依次包含：

1. 从已安装包读取的原始源码；
2. 按提供者顺序执行每个 Patch 后的源码；
3. 最终变换结果。

省略 `--file` 会检查该包的所有已 Patch 文件；两个过滤条件都省略则会输出所有已收集
的检查结果：

```sh
dsh harmony inspect some-dsh-plugin
dsh harmony inspect
```

检查操作永远不会把变换后的源码写回目标包。

## 运行时更新和热重载

Harmony 会监听 profile manifest、`harmony.json` 和声明的 Patch 提供者文件。当
提供者、顺序、启用状态或提供者源码变化时，它会重建受影响的 Loader 分组。

提交更新以前，Harmony 会按完整顺序把所有 Patch 应用到全部受影响目标。预检失败会
保留先前的 Loader Tree 和 profile 状态。成功修改浏览器端 `lib/client.js` 后会使用
Harness 已有的 HMR 路径；Node 目标则通过 Loader Tree 重载。

目标包内部的相对 ESM 导入会继承同一个 generation。CommonJS 重载会使目标包内部的
`require` 依赖图失效。

## 更新 Harmony 或 DSH

通过 npm 更新 Harmony：

```sh
npm install -g dsh-harmony@latest
```

如果之后安装或升级官方 DSH，导致它再次取得 `dsh` 命令，正常启动受影响的 profile：

```sh
dsh web
```

Harmony 的 bootstrap bundle 会恢复 shim，WebUI 随后显示重启横幅。选择 **立刻重启**
即可关闭当前 Loader Tree，并通过 Harmony 重启相同命令。

更换官方 DSH 版本时，应保持在当前 Harmony 版本声明的 peer dependency 范围内。

## 卸载 Harmony

先移除 profile bundle，再卸载全局包：

```sh
dsh plugin --profile web remove dsh-harmony
npm uninstall -g dsh-harmony
dsh web
```

每个包含该 bundle 的 profile 都要执行第一条命令。Harmony 包消失后，shim 会直接
转交已有的官方 CLI；后续一次官方启动会移除 bootstrap 条目。目标插件文件不需要
恢复，因为 Harmony 从未把变换后的源码写入磁盘。

如果先卸载了全局包，请启动仍含 Harmony 的 profile，并在提示中选择 **移除插件**。

## 给插件添加 Harmony Patch

在提供者的 `package.json` 中声明 CommonJS Patch 模块：

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

使用 TSQuery 选择器创建源码 Patch：

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

源码 Patch 使用 TSQuery 和 MagicString。语义 Patch 以具名函数或类方法为目标，可用
`before`、`after`、`around` 或 `replace`。由于语义 Handler 在 Node 进程中执行，
浏览器端 `lib/client.js` 目标必须使用源码 Patch。

`conflicts` 列出需要在双方都启用时产生告警的 Harmony Patch 提供者包名。该声明不会
阻止安装、加载、Patch 应用或热重载，也不影响排序。

如果提供者本身必须在 Harmony 存在时才能启动，可以使用 DSH 现有的依赖机制：

```ts
export const inject = ['harmony']
```

完整源码与语义 API、排序规则和冲突行为见
[声明 Patch](../README.zh-CN.md#声明-patch)。

## 常见问题

### 插件已经安装，但启动器没有激活

在 WebUI 中选择 **安装并重启**，或直接安装全局运行时：

```sh
npm install -g dsh-harmony
```

### `dsh harmony status` 以状态码 1 退出

查看 Patch 键下输出的 `failed` 信息。错误会指出目标包或文件，并报告选择器数量、
版本或应用失败。使用 `dsh harmony inspect <package> --file <file>` 可以比较每一步的
中间源码。

### 自动排序后仍然报告违规

声明的 `before` 和 `after` 约束互相冲突。自动排序会返回违规最少的顺序，并报告涉及
的提供者。可以调整手动顺序，或修改相互冲突的提供者声明。

### 依赖 Harmony 的插件第一次启动时没有加载

完成启动器安装并重启。这是预期行为：只有从进程启动时就启用了运行时 Hook，
`harmony` 服务才会发布。
