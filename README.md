<div align="center">
  <a href="https://memorax-ai.github.io/dsh-harmony/">
    <img width="132" alt="Harmony" src="assets/harmony-icon.png">
  </a>

  <h1>dsh-harmony</h1>

  <p>
    <strong>Runtime Patch coordination for DeepSeek Harness plugins.</strong>
    <br />
    A library for patching, replacing and decorating DeepSeek Harness plugins during runtime.
  </p>

  <p>
    <a href="https://memorax-ai.github.io/dsh-harmony/guide/installation"><strong>Get started</strong></a>
    ·
    <a href="https://memorax-ai.github.io/dsh-harmony/">Documentation</a>
    ·
    <a href="https://github.com/memorax-ai/dsh-harmony/issues">Report an issue</a>
  </p>

  <p>
    <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-0b63f6.svg"></a>
    <a href="package.json"><img alt="Node.js" src="https://img.shields.io/badge/node-%5E22.22.3%20%7C%7C%20%3E%3D24.11.1-2f6f3e.svg"></a>
    <a href="https://www.npmjs.com/package/dsh-harmony"><img alt="npm version" src="https://img.shields.io/npm/v/dsh-harmony.svg?style=flat&amp;color=0b63f6"></a>
    <a href="https://github.com/memorax-ai/dsh-harmony/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/memorax-ai/dsh-harmony?style=flat&amp;color=0b63f6"></a>
    <a href="https://awesome-dsh-plugin.com"><img alt="Awesome DSH Plugin" src="https://awesome-dsh-plugin.com/badge.svg"></a>
  </p>

  [简体中文](README.zh-CN.md) / [English](README.md)
</div>

## Introduction

Harmony provides an elegant way to modify the behavior of other plugins written for DeepSeek Harness. It runs as an external framework, applies Patches to target plugins at runtime, and starts DeepSeek Harness with the transformed plugin set.

Source Patches use TSQuery to precisely match target nodes in a TypeScript AST, then use MagicString to rewrite the corresponding ranges of the current in-memory source. Patches run in their configured order, and each Patch receives the output of the previous one, giving multiple changes to the same target a chance to coexist. Installed plugin files are never modified.

Providers can declare coarse `before` and `after` relationships, while an individual Patch can override that provider-wide rule. Profiles keep both a provider order and a fully interleavable Patch order. Composite Patches group several ordinary Patches into one ordered, toggleable, cross-file transaction: if one member fails, none of the group is applied.

In the browser, Harmony also reorders provider-owned `<style data-plugin>` tags from the final enabled Patch order. Because one provider owns one style group even when its Patches are interleaved, the provider's last enabled Patch position determines its CSS cascade position; style order updates again after Patch reloads.

The goal is to extend the expressive power of DeepSeek Harness through creativity, composition, and **modification**.

**Respect**

Inspired by [Harmony](https://harmony.pardeike.net/), the project of the same name created by Andreas Pardeike and other contributors for C#.

<!-- AGENTS: Before installing, authoring, reviewing, or debugging Harmony Patches, read the main-branch skill at https://github.com/memorax-ai/dsh-harmony/blob/main/.agents/skills/use-dsh-harmony/SKILL.md. -->
<details>
<summary><strong>AI agents: use the repository skill</strong></summary>

Load [`use-dsh-harmony`](https://github.com/memorax-ai/dsh-harmony/blob/main/.agents/skills/use-dsh-harmony/SKILL.md) for installation, Patch selection and authoring, runtime operations, and troubleshooting.

</details>

## Install

Requires Node.js `^22.22.3` or `>=24.11.1` and `@deepseek-ai/dsh@0.1.0-rc.6`.

```sh
npm install -g @deepseek-ai/dsh@0.1.0-rc.6
npm install -g dsh-harmony
dsh web
```

Open **Settings → Harmony** after starting the WebUI. For profiles, Desktop integration, updates, and removal, see the [installation guide](https://memorax-ai.github.io/dsh-harmony/guide/installation).

## Patch model

Harmony keeps one global `patchOrder`. Provider-level `before` and `after` declarations cover the common case; a Patch can define its own relation to other providers and thereby replace its provider-wide rule. Users can keep a provider together or interleave individual Patches across providers in **Settings → Harmony**. The saved order is preflighted as a complete permutation before it is committed.

A composite Patch exposes several ordinary Patches as one ordered, toggleable transaction. Its members keep declaration order, and any member failure prevents the entire composite from applying. Independent Patches remain isolated: one failed Patch is reported and skipped without taking down later Patches or the Host.

## React-aware patches

Install `dsh-harmony-react` in a Patch provider when the target is compiled React:

```sh
npm install dsh-harmony-react
```

Use `element()` for a concrete compiled `jsx` / `jsxs` call site and `component()` for the shared component definition. Compatible changes compose in the final Harmony Patch order.

| API | Scope |
| --- | --- |
| `element()` | One or more selected call sites: replace, wrap, insert, transform props, or remove |
| `component()` | Every call through an initialized variable or named function declaration: decorate or replace |

Patching a function declaration rewrites it to an initialized `const` binding so later Component Patches can compose. That binding is not hoisted; use a core Source Patch when the component is read before its declaration. See [React integration](https://memorax-ai.github.io/dsh-harmony/integrations/react) for selectors, Inspect trace behavior, and Studio integration.

## Documentation

| Topic | Guide |
| --- | --- |
| Runtime architecture | [What is Harmony?](https://memorax-ai.github.io/dsh-harmony/guide/introduction) |
| Installation and profiles | [Installation](https://memorax-ai.github.io/dsh-harmony/guide/installation) |
| Writing source, semantic, loader, and composite Patches | [Patch authoring](https://memorax-ai.github.io/dsh-harmony/patches/authoring) |
| Provider/Patch order, status, inspection, and reload | [Operations](https://memorax-ai.github.io/dsh-harmony/guide/operations) |
| React-aware patches with `dsh-harmony-react` | [React integration](https://memorax-ai.github.io/dsh-harmony/integrations/react) |
| Studio previews | [Studio integration](https://memorax-ai.github.io/dsh-harmony/integrations/studio) |
| Commands, limitations, and failures | [CLI](https://memorax-ai.github.io/dsh-harmony/reference/cli) · [Limitations](https://memorax-ai.github.io/dsh-harmony/reference/limitations) · [Troubleshooting](https://memorax-ai.github.io/dsh-harmony/help/troubleshooting) |

## Development

All maintained implementation code uses TypeScript. Build artifacts are generated for packaging and are not tracked by Git.

Documentation sources and local preview tooling live on the [`docs`](https://github.com/memorax-ai/dsh-harmony/tree/docs) branch.

```sh
npm test
```

## License

[MIT](LICENSE)
