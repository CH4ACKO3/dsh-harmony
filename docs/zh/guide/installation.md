# 安装

## 环境要求

| 组件 | 支持版本 |
| --- | --- |
| Node.js | `^22.22.3` 或 `>=24.11.1` |
| DeepSeek Harness | `@deepseek-ai/dsh@0.1.0-rc.6` |
| 操作系统 | Windows、macOS 或 Linux |

安装前检查 Node：

```sh
node --version
npm --version
```

## 推荐：全局启动器

先安装受支持的官方 CLI，再安装 Harmony：

```sh
npm install -g @deepseek-ai/dsh@0.1.0-rc.6
npm install -g dsh-harmony
dsh web
```

Harmony 通过一个小型持久 shim 保留 `dsh` 命令名。macOS 和 Linux 使用 `dsh` 可执行文件；Windows 使用原生 `dsh.cmd` 和 `dsh.ps1`。现有命令和参数保持不变：

```sh
dsh web
dsh --profile tui
dsh plugin --profile web add ./my-plugin
```

通过任一界面确认运行时：

```sh
dsh harmony
dsh harmony status
```

WebUI 中打开 **设置 → Harmony**。

## 备选：先安装插件

如果你从 DSH 插件流程发现 Harmony，可以先安装 Bundle：

```sh
dsh plugin --profile web add dsh-harmony
dsh web
```

首次启动会提供四个选项：

| 选项 | 行为 |
| --- | --- |
| 安装 | 安装启动器并退出，等待你再次启动 `dsh` |
| 安装并重启 | 安装启动器并立即重启同一 profile |
| 移除插件 | 从当前 profile 移除 `dsh-harmony` |
| 本次忽略 | 本次启动不启用 Harmony 运行时 |

WebUI 会在新进程就绪后刷新页面；交互式终端以编号菜单显示相同选项。

只有重启后的进程加载模块 Hook 后，`harmony` 服务才会发布。这样声明了 `inject = ['harmony']` 的插件不会在未 Patch 的进程中启动。

## Desktop 集成

Desktop 提供可配置 Host 入口后，将其指向公开的 `dsh-harmony/bin`：

```text
Desktop supervisor
  -> dsh-harmony/bin
  -> @deepseek-ai/dsh/lib/bin.js web --host 127.0.0.1 --port 0
  -> readiness URL
  -> BrowserWindow
```

如果 Harmony 与内置 DSH 位于不同 Node 依赖树，设置 `DSH_HARMONY_DSH_ENTRY` 为内置 `@deepseek-ai/dsh/lib/bin.js` 的绝对路径；否则 Harmony 从 Peer Dependency 解析官方 CLI。

Desktop 继续负责 Node 可执行文件、子进程、工作目录、退出处理和就绪协议。这条路径不使用也不修改系统全局 `dsh` shim。

::: info 当前上游边界
当前上游 Desktop 仍直接启动内置官方 CLI。在它开放可配置 Host 入口前，全局 Harmony 安装无法影响 Desktop。
:::

## Profile

当前 profile 决定 Harmony 发现哪些 Provider 和目标。`dsh harmony` 默认使用 `web`，其他 profile 需要显式指定：

```sh
dsh harmony --profile tui
dsh harmony status --profile tui
dsh harmony inspect target-plugin --file lib/index.js --profile tui
```

每个 profile 在 `$DSH_HOME/profiles/<name>/harmony.json` 中保存独立的 Provider `order`、精确的全局 `patchOrder` 和已停用 Patch 键。

## 更新

```sh
npm install -g dsh-harmony@latest
```

如果后续安装 DSH 后 `dsh` 命令被覆盖，正常启动对应 profile。Harmony Bootstrap 会恢复 shim，WebUI 随后显示重启横幅。选择 **立即重启**，即可通过 Harmony 重启同一命令。

官方 DSH 版本应保持在当前 Harmony Release 声明的 Peer Dependency 范围内。

## 卸载

先移除 profile Bundle，再移除全局运行时：

```sh
dsh plugin --profile web remove dsh-harmony
npm uninstall -g dsh-harmony
dsh web
```

对所有包含该 Bundle 的 profile 重复第一条命令。Harmony 移除后，shim 会委托给已有官方 CLI，Bootstrap 条目会在后续官方启动时自行移除。目标文件无需还原。

如果先移除了全局包，启动仍包含 Bundle 的 profile 并选择 **移除插件**。
