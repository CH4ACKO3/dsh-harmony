---
layout: home

title: Harmony
description: DeepSeek Harness 插件的运行时 Patch 协调层。

hero:
  name: Harmony
  text: 为 DeepSeek Harness 插件应用运行时 Patch
  tagline: 一个用于在运行时修补、替换和装饰 DeepSeek Harness 插件的库。
  image:
    src: /harmony-icon.png
    alt: Harmony 交叠圆环标志
  actions:
    - theme: brand
      text: 安装 Harmony
      link: /zh/guide/installation
    - theme: alt
      text: 编写 Patch
      link: /zh/patches/authoring

features:
  - title: 源码 Patch
    details: 使用 TSQuery 查找编译后 TypeScript 中的 AST 节点，再用 MagicString 改写对应的内存源码。
    link: /zh/patches/authoring#源码-patch
    linkText: 编写源码 Patch
  - title: 语义 Patch
    details: 使用 before、after、around 或 replace handler 装饰 Host 中的具名函数，并保留调用链。
    link: /zh/patches/authoring#语义-patch
    linkText: 编写语义 Patch
  - title: React-aware Patch
    details: 使用 element() 修改一个编译后的 jsx 或 jsxs 调用点，或用 component() 装饰、替换定义及其所有调用位置。
    link: /zh/integrations/react
    linkText: 了解 React 集成
  - title: 运行时控制
    details: 移动整个 Provider 或单个 Patch，查看每次修改，撤回编辑，并在不改安装文件的前提下重载。
    link: /zh/guide/operations
    linkText: 操作 Harmony
---

## 修改运行时，而不是安装文件

Harmony 按一份全局顺序运行 Source Patch，后一个 Patch 会读取前一个留下的源码。组合 Patch 让几处修改共用一个位置和开关，而且只有成员全部成功才会应用。独立 Patch 失败时会被报告并跳过，安装目录里的文件不会改变。

```text
已安装源码（保持不变）
  -> 全局 Patch 顺序
  -> 内存中的修改
  -> Host 重载或浏览器 HMR
```

先阅读 [Harmony 在运行时中的位置](/zh/guide/introduction)，再按照[安装指南](/zh/guide/installation)操作。本项目的灵感来自 Andreas Pardeike 和其他贡献者创作的 C# 项目 [Harmony](https://harmony.pardeike.net/)。

<EcosystemShowcase
  mode="compact"
  locale="zh"
  :limit="5"
  heading="插件生态"
  intro="Harmony 帮助这些插件实现它们伟大的想法。"
  refresh-label="再来一些"
/>

[浏览完整生态](/zh/ecosystem) · [提交项目](https://github.com/memorax-ai/dsh-harmony/edit/docs/docs/.vitepress/ecosystem.ts)

## Powered by Harmony

如果你的插件使用 Harmony，欢迎使用这枚徽章来表达支持！

[![Powered by Harmony](/harmony-powered.svg)](https://memorax-ai.github.io/dsh-harmony/)

```md
[![Powered by Harmony](https://memorax-ai.github.io/dsh-harmony/harmony-powered.svg)](https://memorax-ai.github.io/dsh-harmony/)
```
