# CLI 与配置

Harmony 在现有 `dsh` 启动器中增加一个命令组。

## 命令

### `dsh harmony`

打开插件顺序 TUI，默认使用 Web profile。

```sh
dsh harmony
dsh harmony --profile tui
```

### `dsh harmony status`

打印全部已收集 Patch 及其状态。存在失败 Patch 时以状态码 `1` 退出。

```sh
dsh harmony status
dsh harmony status --profile tui
```

### `dsh harmony inspect`

打印目标的原始、中间和最终源码。

```sh
dsh harmony inspect
dsh harmony inspect some-dsh-plugin
dsh harmony inspect some-dsh-plugin --file lib/index.js
```

所有命令都支持 `--profile <name>`。

## Profile 状态

每个 profile 在以下位置保存状态：

```text
$DSH_HOME/profiles/<name>/harmony.json
```

文件包含 `order`、`patchOrder` 与 `disabled`：

- `order` 是终端 TUI 使用的粗粒度 Provider 列表；
- `patchOrder` 是运行时使用的完整稳定 Patch 键排列；
- `disabled` 包含单个 `provider/id` 键或 Provider 级 `provider/*` 条目。

Harmony 会与已安装声明同步：新 Provider 与 Patch 会协调进入顺序，已移除条目会消失。

profile 运行时不要直接编辑该文件。通过 Web 设置或 TUI 修改，才能预检并事务提交候选状态。

## Provider 元数据

Provider 配置位于 `package.json` 的 `dsh.harmony`：

```json
{
  "dsh": {
    "harmony": {
      "patches": ["./patches/a.cjs", "./patches/b.cjs"],
      "after": ["provider-a"],
      "before": ["provider-c"],
      "conflicts": ["legacy-provider"]
    }
  }
}
```

| 字段 | 含义 |
| --- | --- |
| `patches` | 按声明顺序加载的 CommonJS Patch 模块 |
| `before` | 当前 Provider 希望排在其前面的包名 |
| `after` | 当前 Provider 希望排在其后面的包名 |
| `conflicts` | 同时启用时产生不兼容警告的包名 |

单个 Patch 也可以声明 `before` 与 `after`；只要定义任一字段，就会对该 Patch 覆盖 Provider 全局规则。

## 环境变量

| 变量 | 用途 |
| --- | --- |
| `DSH_HOME` | 覆盖包含 profile 和 Harmony 状态的 Harness Home |
| `DSH_HARMONY_DSH_ENTRY` | 显式选择官方 `@deepseek-ai/dsh/lib/bin.js`，主要用于 Desktop 集成 |

## 稳定 Patch 键

Harmony 将 Provider 包名和 Patch `id` 组合成稳定键：

```text
provider-package/patch-id
```

状态、启停、检查、依赖和错误都使用该键。停用 `<provider>/*` 会停用整个 Provider，并移除其当前冲突警告。
