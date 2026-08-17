---
title: Harmony
description: DeepSeek Harness 插件的运行时 Patch 协调层。
---

# Harmony

> 不要重造轮子，去装饰轮子。

Harmony 提供一种以优雅的方式来修改其它为 DeepSeek Harness 编写的插件的功能。它作为一个外置框架，在运行时将补丁应用到目标插件上，并以修改后的插件集运行 DeepSeek Harness。

源码 Patch 通过 TSQuery 在 TypeScript AST 中精确匹配目标节点，再使用 MagicString 改写当前内存源码的对应区间。Patch 按排序依次应用，后一个 Patch 继续处理前一个 Patch 的输出，因此针对同一目标的多个修改有机会和谐共处。整个过程不会写回已安装的插件文件。

该功能旨在让 DeepSeek Harness 的表达能力更进一步：创造性、组合性、**修改性**。

::: info Respect
灵感来源于 Andreas Pardeike 和其它开发者创作的同名 C# 项目 [Harmony](https://harmony.pardeike.net/)
:::

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
  → 检查全部源码变换并跳过失败 Patch
  → 执行新的运行时 generation
```

| 阶段 | 负责方 | 保证 |
| --- | --- | --- |
| 原始源码 | 已安装的插件包 | Harmony 从不写入 |
| Patch 流水线 | Harmony Provider | 确定的顺序与精确匹配检查 |
| 运行时 generation | Harness Loader | 仅在目标重载成功后替换 |

浏览器目标使用 Harness HMR，Node 目标通过 Loader Tree 重载。两者共享同一份 Provider 顺序、Patch 状态和检查链路。

## 相关包

[`dsh-harmony-react`](https://www.npmjs.com/package/dsh-harmony-react) 提供修改已编译 `jsx` 和 `jsxs` 调用的类型化工厂。其可选 Studio 入口可以将这些声明接入 [`dsh-webui-studio`](https://github.com/CH4ACKO3/dsh-webui-studio)。

## 参考

- [npm 包](https://www.npmjs.com/package/dsh-harmony)
- [GitHub 仓库](https://github.com/CH4ACKO3/dsh-harmony)
- [限制](/zh/reference/limitations)
- [MIT License](https://github.com/CH4ACKO3/dsh-harmony/blob/main/LICENSE)
