# 排序、检查与重载

WebUI 和终端修改同一份 profile。它既保存用于整体移动的 Provider 顺序，也保存用于单独放置卡片的全局 Patch 顺序。

## 在 WebUI 中排序 Patch

启动 WebUI，打开 **设置 → Harmony → 插件顺序**：

```sh
dsh web
```

Harmony 只保存一份扁平的 `patchOrder`。UI 会把连续且属于同一 Provider 的 Patch 画成一叠卡片，但堆叠只是显示效果，不会改变顺序。

- 折叠的 Provider 显示一张封面卡，并为每个 Patch 留出一层。点击从封面到底卡之间的区域，会把它们铺成普通 Patch 卡。鼠标离开这些卡片的纵向范围后，卡片会稍等片刻再折叠。
- 拖动折叠堆会一起移动其中连续的 Patch；拖动单个 Patch 则可以插入其他 Provider。蓝线标出插入位置。拖动时在折叠堆上停留片刻会将其展开，鼠标滚轮仍可滚动列表。
- 长按卡片或堆叠但不移动，会把该 Provider 的所有 Patch 收回当前位置，并恢复声明顺序。
- 点击单个 Patch 可查看目标与状态。选中后，其 Provider 保持完整宽度，其它 Provider 缩窄；状态颜色不会被悬浮或选中颜色覆盖。
- **撤回**恢复到上一次保存的 Patch 顺序；**保存**会先预检完整排列，再提交并重载。

禁用卡为灰色，警告为橙黄色，失败为淡红色。折叠封面会汇总活动成员状态；禁用 Patch 不参与封面健康度计算，全部禁用的 Provider 完全变灰。

Provider 增加 Patch 后，Harmony 会按 Provider 顺序插入新条目；已经不存在的 Patch 会从列表移除。`dsh-harmony` 本身不会显示为 Patch 卡。

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

终端只移动整个 Provider，不提供单 Patch 拖动。每次移动都会立即保存，并把该 Provider 的 Patch 在 `patchOrder` 中重新放到一起。Profile 正在运行时，TUI 会请求 Host 检查并热重载新顺序；profile 未运行时，则先在本地检查再写入 `harmony.json`。

手动顺序优先。自动排序会寻找违反 Provider 级 `before` 和 `after` 规则最少的结果；如果有多个同样好的结果，就保留现有相对顺序。单 Patch 交错需要使用 WebUI。

## 声明顺序与用户顺序

Provider 声明决定默认顺序。单个 Patch 只要声明自己的 `before` 或 `after`，就会改用自己的规则，而不是追加 Provider 规则。Harmony 根据这些关系排出一份列表，不使用数值优先级。

用户可以在两个层次覆盖缺失或互相冲突的关系：

- 移动 Provider 会重新聚合其全部 Patch；
- 移动单个 Patch 会保留精确位置，包括插入另一个 Provider 的多个 Patch 之间。

Harmony 会显示违反的排序规则，但不会因此拒绝用户顺序。若列表遗漏、重复或写入了不存在的 Patch，则无法保存。应用顺序时，失败的独立 Patch 会被跳过，失败的组合 Patch 则一个成员也不会应用。

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

Harmony 监听 Loader profile、`harmony.json` 和 Provider 文件。Provider 增删、Patch 编辑、排序、启停和 Loader Tree 更新会逐个事务处理。

提交前，Harmony 会按保存的顺序尝试修改所有受影响目标。独立 Patch 无法匹配或应用时会标记为 `failed` 并跳过，后续 Patch 和 Host 继续运行。组合 Patch 有成员失败时，整个组合都不应用。Provider 无法导入或目标无法重载时，Harmony 会保留原来的运行时和 profile 设置。事务按顺序执行，旧事务的回滚不会覆盖较新的更新。

Patch 声明已经加载、但无法修改目标时，状态会变成 `failed`。常见原因包括目标包、版本或文件不存在，选择器数量与 `expect` 不符，`apply()` 抛错，Semantic Patch 遇到不支持的目标，或同一函数出现第二个语义 `replace`。Provider 无法导入、Patch ID 重复或目标插件无法重载时，失败的是整个事务。

Node 目标重建受影响 Loader Group；浏览器目标通过 Harness HMR 只重载变化的客户端插件。

Harmony 会根据已启用的 Patch 列表排列 Provider 所属的 `<style data-plugin>` 标签。即使一个 Provider 的 Patch 被拆开放置，它仍只有一组 CSS，位置由最后一个启用 Patch 决定。重载后 Harmony 会再次移动这些 Provider 样式，不碰页面中的其它样式。

## 冲突与错误

Harmony 会报告以下冲突：

- 选择器匹配数与 `expect` 不同；
- 两个语义 `replace` 同时指向同一函数；
- 早期 Patch 移除了后续 Patch 的目标；
- `conflicts` 声明的 Provider 同时启用；
- 当前手动顺序违反了约束。

警告会给出 Provider、稳定 Patch 键、目标包和文件。先用 `status` 定位被跳过的 Patch，再用 `inspect` 比较当前 Patch 输入与早期 Provider 输出。只要存在 `failed` Patch，`status` 仍以状态码 `1` 退出，但 Host 可以继续运行。
