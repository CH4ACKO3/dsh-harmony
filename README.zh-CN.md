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

当一个 DeepSeek Harness 插件需要修改另一个插件、又不值得为此维护 Fork 时，可以使用 Harmony。它会在目标插件运行前加载 Patch，在内存中修改编译产物，再让 Harness 运行修改后的代码。

Source Patch 使用 TSQuery 查找 TypeScript AST 节点，再用 MagicString 改写对应的源码区间。Patch 逐个执行，后一个会读取前一个留下的结果，因此多个插件可以修改同一目标。安装目录里的文件不会改变。

Provider 可以声明自己的 Patch 应排在另一个 Provider 之前或之后；单个 Patch 也可以改用自己的规则。用户还能把不同 Provider 的 Patch 交错排列。若几处修改必须一起成功，可以把它们放进组合 Patch：它们共用一个位置和开关，任何成员失败时都不应用。

对于浏览器插件，Harmony 还会按 Patch 顺序整理 Provider 所属的 `<style data-plugin>` 标签。每个 Provider 只有一组样式，它在 CSS 层叠中的位置由最后一个启用的 Patch 决定。Patch 重载后，Harmony 会再整理一次。

Harmony 为 DeepSeek Harness 插件之间的协作补上了修改能力。

**Respect**

灵感来源于 Andreas Pardeike 和其它开发者创作的同名 C# 项目 [**Harmony**](https://harmony.pardeike.net/)。

<!-- AGENTS: Before installing, authoring, reviewing, or debugging Harmony Patches, read the main-branch skill at https://github.com/memorax-ai/dsh-harmony/blob/main/.agents/skills/use-dsh-harmony/SKILL.md. -->
<details>
<summary><strong>AI Agent：使用仓库内置 Skill</strong></summary>

安装、选择和编写 Patch、执行运行时操作或排查问题前，请加载 [`use-dsh-harmony`](https://github.com/memorax-ai/dsh-harmony/blob/main/.agents/skills/use-dsh-harmony/SKILL.md)。

</details>

## 安装

需要 Node.js `^22.22.3` 或 `>=24.11.1`，以及 `@deepseek-ai/dsh@0.1.0-rc.7`。

```sh
npm install -g @deepseek-ai/dsh@0.1.0-rc.7
npm install -g dsh-harmony
dsh web
```

启动 WebUI 后打开 **设置 → Harmony**。Profile、Desktop 集成、更新和卸载说明参见[安装指南](https://memorax-ai.github.io/dsh-harmony/zh/guide/installation)。

## Patch 模型

Harmony 按一份全局 `patchOrder` 运行所有 Patch。Provider 级 `before` / `after` 负责通常的先后关系；单个 Patch 只要声明其中一项，就改用自己的规则。在 **设置 → Harmony** 中，用户可以移动整个 Provider，也可以把一个 Patch 插到另一个 Provider 的两个 Patch 之间。保存时，Harmony 会检查列表是否恰好包含每个已注册 Patch 一次。

组合 Patch 让多个 Patch 共用一个排序位置和开关。成员按声明顺序执行，而且只有全部成功才会应用。独立 Patch 失败时，Harmony 会报告并跳过它；后续 Patch 和 Host 仍会运行。

## React-aware Patch

修改编译后的 React 目标时，在 Patch Provider 中安装 `dsh-harmony-react`：

```sh
npm install dsh-harmony-react
```

`element()` 修改选中的 `jsx` / `jsxs` 调用点，`component()` 修改这些调用共享的组件定义。它们和其它 Source Patch 使用同一份顺序。

| API | 作用范围 |
| --- | --- |
| `element()` | 一个或多个调用点：替换、包裹、插入、变换 Props 或移除 |
| `component()` | 所有通过已初始化变量或具名函数声明进行的调用：装饰或替换 |

为了让后续 Component Patch 继续修改同一定义，Harmony 会把函数声明改写为已初始化的 `const`。新绑定不再提升；如果文件在声明前读取组件，请改用核心 Source Patch。[React 集成](https://memorax-ai.github.io/dsh-harmony/zh/integrations/react)还介绍了选择器、Inspect trace 和 Studio。

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
