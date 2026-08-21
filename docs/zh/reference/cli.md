# CLI 与配置

Harmony 扩展现有 `dsh` 启动器。命令默认使用 Web profile，可以通过 `--profile <name>` 选择其他 profile。支持的命令可以加 `--json` 输出机器可读结果。

## 交互式终端

```sh
dsh harmony
dsh harmony --profile tui
```

按 `Tab` 在 Provider 与 Patch 视图之间切换。TUI 支持排序、自动排序、Patch 与 Provider 启停、检查和在线重载。

## 状态与检查

```sh
dsh harmony status [--json] [--profile <name>]
dsh harmony inspect [package] [--file <file>] [--patch <provider/id>] [--summary] [--json] [--profile <name>]
```

`status` 输出所有已收集 Patch；若仍有 Patch 失败、顺序错误或重载错误，则以状态码 `1` 退出。`inspect` 输出原始源码、按顺序产生的每个中间结果和最终源码。`--summary` 省略源码文本，`--patch` 只保留一个稳定 Patch 键涉及的目标。

## 启停

```sh
dsh harmony disable <provider/id> [--json] [--profile <name>]
dsh harmony enable <provider/id> [--json] [--profile <name>]
dsh harmony disable-provider <provider> [--json] [--profile <name>]
dsh harmony enable-provider <provider> [--json] [--profile <name>]
```

Provider 级启停使用独立的 `provider/*` 标志，不会清除或创建单个 Patch 标志。因此重新启用 Provider 时，原本单独停用的 Patch 仍保持停用。

## 排序

```sh
dsh harmony patch-order show [--json] [--profile <name>]
dsh harmony patch-order move <patch> (--before|--after) <patch> [--json] [--profile <name>]
dsh harmony patch-order auto [--json] [--profile <name>]

dsh harmony provider-order show [--json] [--profile <name>]
dsh harmony provider-order move <provider> (--before|--after) <provider> [--json] [--profile <name>]
dsh harmony provider-order auto [--json] [--profile <name>]
```

当前列表违反约束时，`show` 以状态码 `1` 退出。`auto` 会尽量减少违反的约束，并在可能时保持现有相对顺序。移动 Provider 会重新聚合其 Patch；移动 Patch 则保留精确的跨 Provider 位置。

## 重载

```sh
dsh harmony reload [provider] [--json] [--profile <name>]
```

重载需要在线 Host。省略 Provider 时重载当前图。Harmony 不允许在自身运行时内部热重载自己的 Host 条目；这类变更需要重启 DSH。

## Profile 状态

每个 profile 都在以下位置保存 Harmony 状态：

```text
$DSH_HOME/profiles/<name>/harmony.json
```

文件包含：

- `order`：粗粒度 Provider 列表；
- `patchOrder`：每个已注册稳定 Patch 键各出现一次，并按运行顺序排列；
- `disabled`：单个 `provider/id` 键，以及独立的 Provider 级 `provider/*` 条目。

声明变化时，Harmony 会插入或移除相应条目。Profile 运行时不要直接编辑该文件。Settings、TUI 和非交互命令都会先预检更新，再以事务提交。

## Provider 元数据

```json
{
  "dsh": {
    "plugin": {
      "compatibility": {
        "requires": { "base-provider": "^2.0.0" },
        "conflicts": { "legacy-provider": "*" },
        "integrates": { "optional-renderer": "^1.0.0" }
      }
    },
    "harmony": {
      "patches": ["./patches/a.cjs", "./patches/b.cjs"],
      "after": ["provider-a"],
      "before": ["provider-c"]
    }
  }
}
```

`dsh.harmony.before` 与 `after` 是排序偏好，不是依赖。`dsh.plugin.compatibility` 是通用 DSH 插件元数据：`requires`、`conflicts` 和 `integrates` 将包名映射到 SemVer 范围，只报告关系，不改变插件状态，也不阻止启动。

## 环境变量

| 变量 | 用途 |
| --- | --- |
| `DSH_HOME` | 覆盖包含 profile 与 Harmony 状态的 Harness Home |
| `DSH_HARMONY_DSH_ENTRY` | 指定官方 `@deepseek-ai/dsh/lib/bin.js`，主要用于 Desktop 集成 |
| `DSH_HARMONY_PERF=1` | 为每次启动或更新输出一条结构化计时记录 |

性能记录包括 `prepareMs`、`transformMs`、`hostReloadMs`、`clientRebuildMs` 和 `totalMs`。诊断工具也可以订阅 `dsh-harmony:load` `diagnostics_channel`，无需开启日志。

## 稳定 Patch 键

Harmony 将 Provider 包名与 Patch `id` 组合为：

```text
provider-package/patch-id
```

状态、启停、排序、检查和错误都使用这个键。
