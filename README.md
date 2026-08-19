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

## Usage

Just type *"What about we use dsh-harmony"* when vibe coding your DSH plugin.

## Introduction

Use Harmony when one DeepSeek Harness plugin needs to change another without maintaining a fork. Harmony loads Patches before the target runs, changes its compiled code in memory, and starts Harness with the result.

Source Patches find TypeScript AST nodes with TSQuery and rewrite their source ranges with MagicString. They run one after another, each reading the source left by the previous Patch. This lets several plugins change the same target while leaving installed files untouched.

A provider can place its Patches before or after another provider. One Patch may override that rule, and users may interleave Patches from different providers. When several changes must succeed together, a composite Patch gives them one position and one switch; if a member fails, Harmony applies none of them.

For browser plugins, Harmony also keeps provider-owned `<style data-plugin>` tags in Patch order. A provider owns one style group, so its last enabled Patch decides where that group appears in the CSS cascade. Harmony repeats the ordering after a Patch reload.

Harmony adds modification to the ways DeepSeek Harness plugins can work together.

## Why Harmony

Ordinary DSH extension points remain the first choice when the target exposes the behavior you need. Harmony is for the gap between those APIs and maintaining a fork: changing an internal component, loader entry, or compiled behavior that the target does not expose.

| Without Harmony | With Harmony |
| --- | --- |
| Hide or duplicate an internal UI and keep both implementations aligned | Replace the selected component or compiled call site in place |
| Patch `node_modules`, carry a fork, or reapply edits after upgrades | Transform source in memory; installed package files remain byte-for-byte unchanged |
| Discover a selector drift only after the UI silently breaks | Pin package version and `expect`; mismatches fail visibly in `status` |
| Treat the final bundle as a black box | Inspect the original, every Patch step, and the final transformed source |
| Remove custom edits manually | Disable or remove the Provider to restore the original behavior |

Harmony does not turn compiled internals into a stable public API. It makes that dependency explicit, ordered, inspectable, and reversible.

**Respect**

Inspired by [Harmony](https://harmony.pardeike.net/), the project of the same name created by Andreas Pardeike and other contributors for C#.

<!-- AGENTS: Before installing, authoring, reviewing, or debugging Harmony Patches, read the main-branch skill at https://github.com/memorax-ai/dsh-harmony/blob/main/.agents/skills/use-dsh-harmony/SKILL.md. -->
<details>
<summary><strong>AI agents: use the repository skill</strong></summary>

Load [`use-dsh-harmony`](https://github.com/memorax-ai/dsh-harmony/blob/main/.agents/skills/use-dsh-harmony/SKILL.md) for installation, Patch selection and authoring, runtime operations, and troubleshooting.

</details>

## Install

Requires Node.js `^22.22.3` or `>=24.11.1` and `@deepseek-ai/dsh@0.1.0-rc.7`.

```sh
npm install -g @deepseek-ai/dsh@0.1.0-rc.7
npm install -g dsh-harmony
dsh web
```

Open **Settings → Harmony** after starting the WebUI. For profiles, Desktop integration, updates, and removal, see the [installation guide](https://memorax-ai.github.io/dsh-harmony/guide/installation).

## Patch model

Harmony runs every Patch from one global `patchOrder`. Provider-level `before` and `after` rules set the usual order. A Patch that declares either rule uses its own rules instead. In **Settings → Harmony**, users can move a whole provider or place one Patch between Patches from another provider. Harmony checks that the saved list contains every registered Patch exactly once.

A composite Patch groups several Patches under one order position and switch. Members keep their declared order and apply only when every member succeeds. A failed standalone Patch is reported and skipped; later Patches and the Host continue to run.

## Plugin conflicts

Any DSH plugin package can declare incompatible plugin versions under `dsh.plugin.conflicts`, whether or not it provides Harmony Patches:

```json
{
  "dsh": {
    "plugin": {
      "conflicts": {
        "legacy-plugin": "*",
        "@vendor/other-plugin": "<2.0.0"
      }
    }
  }
}
```

Harmony warns when matching packages are enabled together, but does not disable or block either plugin. One declaration is sufficient, reciprocal declarations produce one warning, and disabling a Harmony Patch does not disable its owning plugin. Conflict targets are package names and values are semver ranges.

## React-aware patches

Install `dsh-harmony-react` in a Patch provider when the target is compiled React:

```sh
npm install dsh-harmony-react
```

Use `element()` to change selected compiled `jsx` / `jsxs` calls. Use `component()` to change the shared component definition. Harmony applies both in the same Patch order as every other Source Patch.

| API | Scope |
| --- | --- |
| `element()` | One or more selected call sites: replace, wrap, insert, transform props, or remove |
| `component()` | Every call through an initialized variable or named function declaration: decorate or replace |

To let later Component Patches modify the same definition, Harmony rewrites a function declaration as an initialized `const`. The new binding is not hoisted. If the file reads the component before its declaration, use a core Source Patch instead. [React integration](https://memorax-ai.github.io/dsh-harmony/integrations/react) covers selectors, Inspect traces, and Studio.

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
