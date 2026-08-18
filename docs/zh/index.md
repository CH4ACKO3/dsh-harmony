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
    details: 使用 TSQuery 匹配编译后源码中的 TypeScript AST 节点，再通过 MagicString 精确改写当前内存区间。
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
    details: 跨 Provider 交错单个 Patch、拖动整个 Provider 堆、检查变换、撤回编辑，并以事务方式保存。
    link: /zh/guide/operations
    linkText: 操作 Harmony
---

## 修改运行时，而不是安装文件

Harmony 会解析出一条确定的全局 Patch 顺序。每个 Source Patch 都会继续处理前一个 Patch 的输出，因此针对同一目标的独立修改可以组合生效。组合 Patch 共享一个位置、启停状态和原子成功边界。无法应用的 Patch 会被记录并跳过；Harmony 始终不会改写已安装的插件文件。

```text
已安装源码（保持不变）
  -> 全局 Patch 顺序
  -> 经过验证的内存变换
  -> Host 重载或浏览器 HMR
```

你可以先了解 [Harmony 在运行时中的位置](/zh/guide/introduction)，或直接阅读[安装指南](/zh/guide/installation)。项目灵感来自 Andreas Pardeike 和其他贡献者创作的同名 C# 项目 [Harmony](https://harmony.pardeike.net/)。
