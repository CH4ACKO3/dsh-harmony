# 排序、检查与重载

WebUI 和终端操作同一份 profile 顺序、Patch 状态与事务更新路径。

## 在 WebUI 中排序

启动 WebUI，打开 **设置 → Harmony → 插件顺序**：

```sh
dsh web
```

列表会镜像当前 Loader Tree 中的全部插件。没有 Harmony Patch 的普通插件也保持可见，但只有 Patch Provider 会影响应用顺序。

- 拖动条目排序，按住条目时仍可使用原生滚轮滚动。
- 用方向键选择条目，再用 Alt+方向键移动。
- `dsh-harmony` 固定在顶部。
- 保存前会预检完整 Patch 集合，成功后才提交并重载。
- 关闭设置或切换页面时，如果有未保存草稿，可以保存、放弃或继续编辑。

新插件会自动追加，已卸载插件会从保存顺序中移除。

## 在终端中排序

```sh
dsh harmony
```

使用 `dsh harmony --profile <name>` 选择其他 profile。

| 按键 | 操作 |
| --- | --- |
| 上 / 下或 `k` / `j` | 选择插件 |
| `u` / `d` | 移动当前插件 |
| `a` | 计算违反约束最少的顺序 |
| `r` | 与已安装依赖同步 |
| `q`、Escape 或 Ctrl+C | 退出 |

每次移动都会立即保存。如果 profile 正在运行，TUI 会请求该进程预检并热重载；否则会在写入 `harmony.json` 前进行本地预检。

手动顺序始终有效。自动排序只负责最小化 `before` 和 `after` 约束违规，并在多个答案相同时保留现有相对顺序。

## 检查 Patch 状态

```sh
dsh harmony status
dsh harmony status --profile tui
```

每条记录包含稳定的 `provider/id` 键、目标、绑定状态、匹配数和 generation。

| 状态 | 含义 |
| --- | --- |
| `pending` | 已收集，尚未绑定到已加载目标 |
| `bound` | 已应用到当前 generation |
| `disabled` | 在当前 profile 中停用 |
| `failed` | 收集、解析、匹配或应用失败 |

存在任何失败 Patch 时，`status` 以状态码 `1` 退出，因此可用于 CI 或发布检查。WebUI 的 **Patch 状态** 页面提供相同信息，并支持启停单个 Patch。

## 检查变换后的源码

```sh
dsh harmony inspect some-dsh-plugin --file lib/index.js
```

输出依次包含原始源码、每个 Provider Patch 后的源码和最终源码。省略过滤条件可以扩大范围：

```sh
dsh harmony inspect some-dsh-plugin
dsh harmony inspect
```

检查命令不会把变换结果写回目标包。

## 事务更新

Harmony 监听 Loader profile、`harmony.json` 和声明的 Provider 文件。Provider 增删、Patch 编辑、顺序变化、启停变化与 Loader Tree 更新进入同一条串行事务队列。

提交前，Harmony 会把完整有序 Patch 集合应用到所有受影响目标。预检失败会保留上一代运行时与 profile 状态，旧回滚也无法覆盖较新的已提交更新。

Node 目标重建受影响 Loader Group；浏览器目标通过 Harness HMR 只重载变化的客户端插件。

## 冲突与错误

Harmony 会明确报告：

- 选择器匹配数与 `expect` 不同；
- 两个语义 `replace` 同时指向同一函数；
- 早期 Patch 移除了后续 Patch 的目标；
- `conflicts` 声明的 Provider 同时启用；
- 当前手动顺序违反了约束。

错误会给出 Provider、稳定 Patch 键、目标包和文件。先用 `status` 定位，再用 `inspect` 比较当前 Patch 输入与早期 Provider 输出。
