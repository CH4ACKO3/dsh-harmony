# 故障排查

## Bundle 已安装，但 Harmony 未启用

首次启动选择 **安装并重启**，或直接安装运行时：

```sh
npm install -g dsh-harmony
dsh harmony status
```

## `status` 以状态码 1 退出

查看稳定 Patch 键下的 `failed` 记录。错误会指出目标包、文件、选择器数量、版本不匹配或应用失败。

```sh
dsh harmony inspect <package> --file <file>
```

检查每一步中间源码，确认失败 Patch 实际收到的输入。

## 选择器不再匹配

目标的编译结构发生了变化。查看原始源码并更新 TSQuery，再把 `target.version` 调整为实际测试过的版本。`expect` 应填写查到的匹配数，不要接受未知数量。

## 自动排序仍然报告违规

`before` 和 `after` 规则互相冲突。自动排序会给出违规最少的顺序，并列出相关 Provider。可以修正声明、移动 Provider，或在 WebUI 中单独移动 Patch。Patch 自己的规则会替换 Provider 规则，而不是追加到后面。

## Patch 后的函数在声明后正常、声明前失败

`component()` 会把具名函数声明改写为 `const`，让后续 Component Patch 可以修改同一绑定。新绑定不再提升。请改用核心 Source Patch，或确保目标在声明后才第一次读取组件。

## 依赖 Harmony 的插件首次启动时没有运行

完成启动器安装并重启。这是预期行为：只有从启动时就加载模块 Hook 的进程才会发布 `harmony` 服务。

## 官方 DSH 更新覆盖了 shim

正常启动对应 profile。Harmony Bootstrap 会恢复启动器，WebUI 提供 **立即重启**。重启后的进程会在 Loader Tree 之前加载 Hook。

## 热更新失败

Harmony 会保留上一代运行状态。通过 **Patch 状态** 或 `status` 找到问题，修正 Provider 后重新保存或重载。无需恢复目标文件。

## Desktop 不受全局 Harmony 影响

Desktop 直接启动内置 CLI，因此全局命令 shim 无法影响它。Desktop 需要提供指向 `dsh-harmony/bin` 的可配置 Host 入口。若内置 DSH 位于另一棵依赖树，还要设置 `DSH_HARMONY_DSH_ENTRY`。

## 移除 Harmony 后 profile 仍然提示

说明全局包早于 profile Bundle 被移除。启动该 profile 并选择 **移除插件**，或执行：

```sh
dsh plugin --profile <name> remove dsh-harmony
```

仍无法解决时，请提交 [GitHub Issue](https://github.com/memorax-ai/dsh-harmony/issues)，并附上 DSH 版本、Node 版本、profile 名、失败的稳定 Patch 键与相关 `status` 输出。
