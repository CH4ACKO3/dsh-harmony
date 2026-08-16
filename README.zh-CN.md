<div align="center">
  <a href="https://ch4acko3.github.io/dsh-harmony/zh/">
    <img width="132" alt="Harmony" src="assets/harmony-icon.png">
  </a>

  <h1>dsh-harmony</h1>

  <p>
    <strong>DeepSeek Harness 插件的运行时 Patch 协调层。</strong>
    <br />
    一个用于在运行时修补、替换和装饰 DeepSeek Harness 插件的库。
  </p>

  <p>
    <a href="https://ch4acko3.github.io/dsh-harmony/zh/guide/installation"><strong>开始使用</strong></a>
    ·
    <a href="https://ch4acko3.github.io/dsh-harmony/zh/">文档</a>
    ·
    <a href="https://github.com/CH4ACKO3/dsh-harmony/issues">报告问题</a>
  </p>

  <p>
    <a href="LICENSE"><img alt="许可证：MIT" src="https://img.shields.io/badge/license-MIT-0b63f6.svg"></a>
    <a href="package.json"><img alt="Node.js" src="https://img.shields.io/badge/node-%5E22.22.3%20%7C%7C%20%3E%3D24.11.1-2f6f3e.svg"></a>
    <a href="https://www.npmjs.com/package/dsh-harmony"><img alt="npm 版本" src="https://img.shields.io/npm/v/dsh-harmony.svg?style=flat&amp;color=0b63f6"></a>
    <a href="https://github.com/CH4ACKO3/dsh-harmony/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/CH4ACKO3/dsh-harmony?style=flat&amp;color=0b63f6"></a>
    <a href="https://awesome-dsh-plugin.com"><img alt="Awesome DSH Plugin" src="https://awesome-dsh-plugin.com/badge.svg"></a>
  </p>

  [简体中文](README.zh-CN.md) / [English](README.md)
</div>

## 简介

Harmony 提供一种以优雅的方式来修改其它为 DeepSeek Harness 编写的插件的功能。它作为一个外置框架，在运行时将补丁应用到目标插件上，并以修改后的插件集运行 DeepSeek Harness。

源码 Patch 通过 TSQuery 在 TypeScript AST 中精确匹配目标节点，再使用 MagicString 改写当前内存源码的对应区间。Patch 按排序依次应用，后一个 Patch 继续处理前一个 Patch 的输出，因此针对同一目标的多个修改有机会和谐共处。整个过程不会写回已安装的插件文件。

该功能旨在让 DeepSeek Harness 的表达能力更进一步：创造性、组合性、**修改性**。

**Respect**

灵感来源于 Andreas Pardeike 和其它开发者创作的同名 C# 项目 [**Harmony**](https://harmony.pardeike.net/)。

<!-- AGENTS: Before installing, authoring, reviewing, or debugging Harmony Patches, read the main-branch skill at https://github.com/CH4ACKO3/dsh-harmony/blob/main/.agents/skills/use-dsh-harmony/SKILL.md. -->
<details>
<summary><strong>AI Agent：使用仓库内置 Skill</strong></summary>

安装、选择和编写 Patch、执行运行时操作或排查问题前，请加载 [`use-dsh-harmony`](https://github.com/CH4ACKO3/dsh-harmony/blob/main/.agents/skills/use-dsh-harmony/SKILL.md)。

</details>

## 安装

需要 Node.js `^22.22.3` 或 `>=24.11.1`，以及 `@deepseek-ai/dsh@0.1.0-rc.6`。

```sh
npm install -g @deepseek-ai/dsh@0.1.0-rc.6
npm install -g dsh-harmony
dsh web
```

启动 WebUI 后打开 **设置 → Harmony**。Profile、Desktop 集成、更新和卸载说明参见[安装指南](https://ch4acko3.github.io/dsh-harmony/zh/guide/installation)。

## 文档

| 主题 | 指南 |
| --- | --- |
| 运行时架构 | [Harmony 是什么？](https://ch4acko3.github.io/dsh-harmony/zh/guide/introduction) |
| 安装与 profile | [安装](https://ch4acko3.github.io/dsh-harmony/zh/guide/installation) |
| 编写源码与语义 Patch | [Patch 编写指南](https://ch4acko3.github.io/dsh-harmony/zh/patches/authoring) |
| 排序、状态、检查和重载 | [运行操作](https://ch4acko3.github.io/dsh-harmony/zh/guide/operations) |
| 使用 `dsh-harmony-react` 编写 React Patch | [React 集成](https://ch4acko3.github.io/dsh-harmony/zh/integrations/react) |
| Studio 预览 | [Studio 集成](https://ch4acko3.github.io/dsh-harmony/zh/integrations/studio) |
| 命令、限制与故障 | [CLI](https://ch4acko3.github.io/dsh-harmony/zh/reference/cli) · [限制](https://ch4acko3.github.io/dsh-harmony/zh/reference/limitations) · [故障排查](https://ch4acko3.github.io/dsh-harmony/zh/help/troubleshooting) |

## 开发

所有维护中的实现源码均使用 TypeScript。用于发布的编译产物由构建生成，不纳入 Git 跟踪。

文档源码与本地预览工具位于 [`docs`](https://github.com/CH4ACKO3/dsh-harmony/tree/docs) 分支。

```sh
npm test
```

## 许可证

[MIT](LICENSE)
