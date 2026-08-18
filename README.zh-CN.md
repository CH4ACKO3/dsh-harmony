<div align="center">
  <a href="https://memorax-ai.github.io/dsh-harmony/zh/">
    <img width="132" alt="Harmony" src="assets/harmony-icon.png">
  </a>

  <h1>dsh-harmony</h1>

  <p>
    <strong>DeepSeek Harness 插件的运行时 Patch 协调层。</strong>
    <br />
    一个用于在运行时修补、替换和装饰 DeepSeek Harness 插件的库。
  </p>

  <p>
    <a href="https://memorax-ai.github.io/dsh-harmony/zh/guide/installation"><strong>开始使用</strong></a>
    ·
    <a href="https://memorax-ai.github.io/dsh-harmony/zh/">文档</a>
    ·
    <a href="https://github.com/memorax-ai/dsh-harmony/issues">报告问题</a>
  </p>

  <p>
    <a href="LICENSE"><img alt="许可证：MIT" src="https://img.shields.io/badge/license-MIT-0b63f6.svg"></a>
    <a href="package.json"><img alt="Node.js" src="https://img.shields.io/badge/node-%5E22.22.3%20%7C%7C%20%3E%3D24.11.1-2f6f3e.svg"></a>
    <a href="https://www.npmjs.com/package/dsh-harmony"><img alt="npm 版本" src="https://img.shields.io/npm/v/dsh-harmony.svg?style=flat&amp;color=0b63f6"></a>
    <a href="https://github.com/memorax-ai/dsh-harmony/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/memorax-ai/dsh-harmony?style=flat&amp;color=0b63f6"></a>
    <a href="https://awesome-dsh-plugin.com"><img alt="Awesome DSH Plugin" src="https://awesome-dsh-plugin.com/badge.svg"></a>
  </p>

  [简体中文](README.zh-CN.md) / [English](README.md)
</div>

## 简介

Harmony 提供一种以优雅的方式来修改其它为 DeepSeek Harness 编写的插件的功能。它作为一个外置框架，在运行时将补丁应用到目标插件上，并以修改后的插件集运行 DeepSeek Harness。

源码 Patch 通过 TSQuery 在 TypeScript AST 中精确匹配目标节点，再使用 MagicString 改写当前内存源码的对应区间。Patch 按排序依次应用，后一个 Patch 继续处理前一个 Patch 的输出，因此针对同一目标的多个修改有机会和谐共处。整个过程不会写回已安装的插件文件。

Provider 可以通过 `before` 和 `after` 声明粗粒度关系，单个 Patch 也可以覆盖所属 Provider 的全局规则。配置同时保存 Provider 顺序和可跨 Provider 任意交错的 Patch 顺序。组合 Patch 则把多个普通 Patch 作为一个排序、开关和跨文件事务单元：任一成员失败，整个组合都不会应用。

浏览器端也会按最终启用的 Patch 顺序重排 Provider 所属的 `<style data-plugin>` 标签。同一 Provider 即使有多个交错的 Patch，仍只拥有一组样式，因此以它最后一个启用 Patch 的位置决定 CSS 层叠位置；Patch 热重载后会再次同步。

该功能旨在让 DeepSeek Harness 的表达能力更进一步：创造性、组合性、**修改性**。

**Respect**

灵感来源于 Andreas Pardeike 和其它开发者创作的同名 C# 项目 [**Harmony**](https://harmony.pardeike.net/)。

<!-- AGENTS: Before installing, authoring, reviewing, or debugging Harmony Patches, read the main-branch skill at https://github.com/memorax-ai/dsh-harmony/blob/main/.agents/skills/use-dsh-harmony/SKILL.md. -->
<details>
<summary><strong>AI Agent：使用仓库内置 Skill</strong></summary>

安装、选择和编写 Patch、执行运行时操作或排查问题前，请加载 [`use-dsh-harmony`](https://github.com/memorax-ai/dsh-harmony/blob/main/.agents/skills/use-dsh-harmony/SKILL.md)。

</details>

## 安装

需要 Node.js `^22.22.3` 或 `>=24.11.1`，以及 `@deepseek-ai/dsh@0.1.0-rc.6`。

```sh
npm install -g @deepseek-ai/dsh@0.1.0-rc.6
npm install -g dsh-harmony
dsh web
```

启动 WebUI 后打开 **设置 → Harmony**。Profile、Desktop 集成、更新和卸载说明参见[安装指南](https://memorax-ai.github.io/dsh-harmony/zh/guide/installation)。

## Patch 模型

Harmony 维护一份全局 `patchOrder`。Provider 级 `before` / `after` 适合表达常见关系；单个 Patch 可以声明自己相对其它 Provider 的位置，并覆盖所属 Provider 的全局规则。用户既可以整体移动一个 Provider，也可以在 **设置 → Harmony** 中把单个 Patch 插入其它 Provider 的多个 Patch 之间。保存前会把完整顺序作为一个排列进行预检。

组合 Patch 把多个普通 Patch 暴露为一个排序、启停与事务单元。成员保持声明顺序；任一成员失败，整个组合都不应用。相互独立的 Patch 则保持失败隔离：单个 Patch 失败会被报告并跳过，不会拖垮后续 Patch 或 Host。

## React-aware Patch

修改编译后的 React 目标时，在 Patch Provider 中安装 `dsh-harmony-react`：

```sh
npm install dsh-harmony-react
```

`element()` 修改具体的 `jsx` / `jsxs` 调用点；`component()` 修改所有调用共享的组件定义。兼容修改按 Harmony 最终 Patch 顺序组合。

| API | 作用范围 |
| --- | --- |
| `element()` | 一个或多个调用点：替换、包裹、插入、变换 Props 或移除 |
| `component()` | 所有通过已初始化变量或具名函数声明进行的调用：装饰或替换 |

函数声明会被改写为已初始化的 `const`，从而让后续 Component Patch 继续组合；该绑定不再具有声明提升。目标在声明前读取组件时，请改用核心 Source Patch。选择器、Inspect trace 与 Studio 集成参见 [React 集成](https://memorax-ai.github.io/dsh-harmony/zh/integrations/react)。

## 文档

| 主题 | 指南 |
| --- | --- |
| 运行时架构 | [Harmony 是什么？](https://memorax-ai.github.io/dsh-harmony/zh/guide/introduction) |
| 安装与 profile | [安装](https://memorax-ai.github.io/dsh-harmony/zh/guide/installation) |
| 编写源码、语义、加载器与组合 Patch | [Patch 编写指南](https://memorax-ai.github.io/dsh-harmony/zh/patches/authoring) |
| Provider/Patch 排序、状态、检查和重载 | [运行操作](https://memorax-ai.github.io/dsh-harmony/zh/guide/operations) |
| 使用 `dsh-harmony-react` 编写 React Patch | [React 集成](https://memorax-ai.github.io/dsh-harmony/zh/integrations/react) |
| Studio 预览 | [Studio 集成](https://memorax-ai.github.io/dsh-harmony/zh/integrations/studio) |
| 命令、限制与故障 | [CLI](https://memorax-ai.github.io/dsh-harmony/zh/reference/cli) · [限制](https://memorax-ai.github.io/dsh-harmony/zh/reference/limitations) · [故障排查](https://memorax-ai.github.io/dsh-harmony/zh/help/troubleshooting) |

## 开发

所有维护中的实现源码均使用 TypeScript。用于发布的编译产物由构建生成，不纳入 Git 跟踪。

文档源码与本地预览工具位于 [`docs`](https://github.com/memorax-ai/dsh-harmony/tree/docs) 分支。

```sh
npm test
```

## 许可证

[MIT](LICENSE)
