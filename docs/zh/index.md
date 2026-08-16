---
title: dsh-harmony
description: DeepSeek Harness 插件的运行时 Patch 协调层。
---

# dsh-harmony

一个用于在运行时修补、替换和装饰 DeepSeek Harness 插件的库。

Harmony 在 Harness Loader 执行插件之前，在内存中变换已编译的 Host 和 WebUI 模块。安装目录中的插件文件始终保持不变，更新失败时继续使用上一代运行状态。

## 安装

需要 Node.js `^22.22.3` 或 `>=24.11.1`，以及 `@deepseek-ai/dsh@0.1.0-rc.6`。

```sh
npm install -g @deepseek-ai/dsh@0.1.0-rc.6
npm install -g dsh-harmony
dsh web
```

启动后打开 **设置 → Harmony**，或在另一个终端运行 `dsh harmony`。Profile、Desktop 集成、更新和卸载参见[安装指南](/zh/guide/installation)。

## 文档

| 任务 | 指南 |
| --- | --- |
| 理解 Harmony 在哪里运行 | [运行时架构](/zh/guide/introduction) |
| 安装并配置 profile | [安装](/zh/guide/installation) |
| 排序、检查、停用与重载 | [运行操作](/zh/guide/operations) |
| 编写源码或语义 Patch | [Patch 编写指南](/zh/patches/authoring) |
| Patch 编译后的 React 树 | [React 集成](/zh/integrations/react) |
| 暴露可编辑的 Studio 变量 | [Studio 集成](/zh/integrations/studio) |
| 查询命令和状态文件 | [CLI 参考](/zh/reference/cli) |
| 排查失败的 Patch | [故障排查](/zh/help/troubleshooting) |

## 运行模型

```text
已安装的插件源码（不修改）
  → 收集已启用的 Patch Provider
  → 解析 Provider 顺序与冲突
  → 预检全部源码变换
  → 执行新的运行时 generation
```

| 阶段 | 负责方 | 保证 |
| --- | --- | --- |
| 原始源码 | 已安装的插件包 | Harmony 从不写入 |
| Patch 流水线 | Harmony Provider | 确定的顺序与精确匹配检查 |
| 运行时 generation | Harness Loader | 仅在预检成功后替换 |

浏览器目标使用 Harness HMR，Node 目标通过 Loader Tree 重载。两者共享同一份 Provider 顺序、Patch 状态和检查链路。

## 相关包

[`dsh-harmony-react`](https://www.npmjs.com/package/dsh-harmony-react) 提供修改已编译 `jsx` 和 `jsxs` 调用的类型化工厂。其可选 Studio 入口可以将这些声明接入 [`dsh-webui-studio`](https://github.com/CH4ACKO3/dsh-webui-studio)。

## 参考

- [npm 包](https://www.npmjs.com/package/dsh-harmony)
- [GitHub 仓库](https://github.com/CH4ACKO3/dsh-harmony)
- [限制](/zh/reference/limitations)
- [MIT License](https://github.com/CH4ACKO3/dsh-harmony/blob/main/LICENSE)
