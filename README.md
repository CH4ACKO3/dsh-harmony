<div align="center">
  <a href="https://ch4acko3.github.io/dsh-harmony/">
    <img width="132" alt="Harmony" src="assets/harmony-icon.png">
  </a>

  <h1>dsh-harmony</h1>

  <p>
    <strong>Runtime Patch coordination for DeepSeek Harness plugins.</strong>
    <br />
    A library for patching, replacing and decorating DeepSeek Harness plugins during runtime.
  </p>

  <p>
    <a href="https://ch4acko3.github.io/dsh-harmony/guide/installation"><strong>Get started</strong></a>
    ·
    <a href="https://ch4acko3.github.io/dsh-harmony/">Documentation</a>
    ·
    <a href="https://github.com/CH4ACKO3/dsh-harmony/issues">Report an issue</a>
  </p>

  <p>
    <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-0b63f6.svg"></a>
    <a href="package.json"><img alt="Node.js" src="https://img.shields.io/badge/node-%5E22.22.3%20%7C%7C%20%3E%3D24.11.1-2f6f3e.svg"></a>
    <a href="https://www.npmjs.com/package/dsh-harmony"><img alt="npm version" src="https://img.shields.io/npm/v/dsh-harmony.svg?style=flat&amp;color=0b63f6"></a>
    <a href="https://github.com/CH4ACKO3/dsh-harmony/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/CH4ACKO3/dsh-harmony?style=flat&amp;color=0b63f6"></a>
    <a href="https://awesome-dsh-plugin.com"><img alt="Awesome DSH Plugin" src="https://awesome-dsh-plugin.com/badge.svg"></a>
  </p>

  [简体中文](README.zh-CN.md) / [English](README.md)
</div>

<!-- AGENTS: Before installing, authoring, reviewing, or debugging Harmony Patches, read .agents/skills/use-dsh-harmony/SKILL.md. -->
<details>
<summary><strong>AI agents: use the repository skill</strong></summary>

Load [`use-dsh-harmony`](.agents/skills/use-dsh-harmony/SKILL.md) for installation, Patch selection and authoring, runtime operations, and troubleshooting.

</details>

## Install

Requires Node.js `^22.22.3` or `>=24.11.1` and `@deepseek-ai/dsh@0.1.0-rc.6`.

```sh
npm install -g @deepseek-ai/dsh@0.1.0-rc.6
npm install -g dsh-harmony
dsh web
```

Open **Settings → Harmony** after starting the WebUI. For profiles, Desktop integration, updates, and removal, see the [installation guide](https://ch4acko3.github.io/dsh-harmony/guide/installation).

## Documentation

| Topic | Guide |
| --- | --- |
| Runtime architecture | [What is Harmony?](https://ch4acko3.github.io/dsh-harmony/guide/introduction) |
| Installation and profiles | [Installation](https://ch4acko3.github.io/dsh-harmony/guide/installation) |
| Writing source and semantic Patches | [Patch authoring](https://ch4acko3.github.io/dsh-harmony/patches/authoring) |
| Order, status, inspection, and reload | [Operations](https://ch4acko3.github.io/dsh-harmony/guide/operations) |
| React-aware patches with `dsh-harmony-react` | [React integration](https://ch4acko3.github.io/dsh-harmony/integrations/react) |
| Studio previews | [Studio integration](https://ch4acko3.github.io/dsh-harmony/integrations/studio) |
| Commands, limitations, and failures | [CLI](https://ch4acko3.github.io/dsh-harmony/reference/cli) · [Limitations](https://ch4acko3.github.io/dsh-harmony/reference/limitations) · [Troubleshooting](https://ch4acko3.github.io/dsh-harmony/help/troubleshooting) |

## Development

All maintained implementation code uses TypeScript. Build artifacts are generated for packaging and are not tracked by Git.

```sh
npm test
npm run docs:dev
npm run docs:build
```

## License

[MIT](LICENSE)
