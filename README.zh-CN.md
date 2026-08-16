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

```sh
npm test
npm run docs:dev
npm run docs:build
```

## 许可证

[MIT](LICENSE)
