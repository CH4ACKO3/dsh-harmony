# 排序、检查与重载

WebUI 和终端操作同一份 profile 状态、Patch 状态与事务更新路径。Profile 同时包含粗粒度 Provider 顺序和精确的全局 Patch 顺序。

## 在 WebUI 中排序 Patch

启动 WebUI，打开 **设置 → Harmony → 插件顺序**：

```sh
dsh web
```

底层模型是一份扁平 `patchOrder`。UI 会动态把连续、同 Provider 的 Patch 协调成视觉堆叠；堆叠本身从不改变顺序。

- 折叠 Provider 由一张封面和每个 Patch 对应的一层卡片构成。点击可见堆叠区域会展开为扁平 Patch 卡；鼠标纵坐标离开整个连续段后，会在短暂延迟后重新折叠。
- 拖动折叠堆可以整体移动连续卡片，拖动单个 Patch 则可插入其它 Provider。最近间隙由蓝色分割线标记；拖动时悬浮在折叠堆上会延迟展开，原生滚轮仍可滚动列表。
- 在不拖动的情况下长按卡片或堆叠，会把全局所有同 Provider Patch 召回当前位置，并恢复 Provider 声明顺序。
- 点击单个 Patch 可查看目标与状态。选中后，其 Provider 保持完整宽度，其它 Provider 缩窄；状态颜色不会被悬浮或选中颜色覆盖。
- **撤回**恢复到上一次保存的 Patch 顺序；**保存**会先预检完整排列，再提交并重载。

禁用卡为灰色，警告为橙黄色，失败为淡红色。折叠封面会汇总活动成员状态；禁用 Patch 不参与封面健康度计算，全部禁用的 Provider 完全变灰。

新 Patch 会按已保存 Provider 顺序协调加入，已移除 Patch 会消失。`dsh-harmony` 本身不会作为 Patch 卡出现在此列表。

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

终端 TUI 刻意保持 Provider 级。每次移动都会立即保存，并在 `patchOrder` 中重新聚合该 Provider 的 Patch。如果 profile 正在运行，TUI 会请求该进程预检并热重载；否则会在写入 `harmony.json` 前进行本地预检。

手动顺序始终有效。自动排序只负责最小化 Provider 级 `before` 和 `after` 约束违规，并在多个答案相同时保留现有相对顺序。Patch 级交错请使用 WebUI。

## 声明顺序与用户顺序

Provider 声明提供粗粒度默认值。单个 Patch 只要定义自己的 `before` 或 `after`，就会对自身覆盖 Provider 全局规则。Harmony 会把这些关系解析为一份全局列表，不使用数值优先级。

用户可以在两个层次覆盖缺失或互相冲突的关系：

- 移动 Provider 会重新聚合其全部 Patch；
- 移动单个 Patch 会保留精确位置，包括插入另一个 Provider 的多个 Patch 之间。

约束违规属于状态信息，不会导致手动顺序被拒绝；保存会拒绝缺失、重复或未知 Patch 的排列。变换失败遵循下文的隔离规则：独立 Patch 会被跳过，失败的组合 Patch 会作为一个整体回滚。

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

输出依次包含原始源码、全局 Patch 顺序中每一步后的源码和最终源码。省略过滤条件可以扩大范围：

```sh
dsh harmony inspect some-dsh-plugin
dsh harmony inspect
```

检查命令不会把变换结果写回目标包。

## 事务更新

Harmony 监听 Loader profile、`harmony.json` 和声明的 Provider 文件。Provider 增删、Patch 编辑、顺序变化、启停变化与 Loader Tree 更新进入同一条串行事务队列。

提交前，Harmony 会把完整有序 Patch 集合应用到所有受影响目标。无法匹配或应用的独立 Patch 会被标记为 `failed`、记录跳过警告，并且不会阻止后续 Patch 或 Host 运行。组合 Patch 的任一成员失败时，该组合的所有成员都不会应用。Provider 声明加载失败或目标重载失败仍会保留上一代运行时与 profile 状态，旧回滚也无法覆盖较新的已提交更新。

这里的失败 Patch，是指声明已经成功加载，但无法安全改写当前目标：例如目标包、版本或文件不可用，`select` 与 `expect` 不再符合编译产物，`apply()` 抛错，Semantic Patch 遇到不支持的目标结构，或排序靠后的 `replace` 与第一个替换发生冲突。Patch 插件无法导入、Patch ID 重复以及目标插件无法重载属于事务失败，Harmony 会回滚候选 generation。

Node 目标重建受影响 Loader Group；浏览器目标通过 Harness HMR 只重载变化的客户端插件。

Harmony 还会把最终启用的 Patch 顺序投影到 Provider 所属的 `<style data-plugin>` 标签。同一 Provider 即使有多个交错 Patch，仍只拥有一组 CSS，因此由其最后一个启用 Patch 决定层叠位置。重载后会再次同步，同时不会把无关页面样式移出原有槽位。

## 冲突与错误

Harmony 会明确报告：

- 选择器匹配数与 `expect` 不同；
- 两个语义 `replace` 同时指向同一函数；
- 早期 Patch 移除了后续 Patch 的目标；
- `conflicts` 声明的 Provider 同时启用；
- 当前手动顺序违反了约束。

警告会给出 Provider、稳定 Patch 键、目标包和文件。先用 `status` 定位被跳过的 Patch，再用 `inspect` 比较当前 Patch 输入与早期 Provider 输出。只要存在 `failed` Patch，`status` 仍以状态码 `1` 退出，但 Host 可以继续运行。
