---
title: dsh-harmony
description: Runtime Patch coordination for DeepSeek Harness plugins.
---

# dsh-harmony

A library for patching, replacing and decorating DeepSeek Harness plugins during runtime.

Harmony transforms compiled Host and WebUI modules in memory before the Harness Loader executes them. Installed plugin files remain unchanged, and failed updates keep the previous runtime generation active.

## Install

Requires Node.js `^22.22.3` or `>=24.11.1` and `@deepseek-ai/dsh@0.1.0-rc.6`.

```sh
npm install -g @deepseek-ai/dsh@0.1.0-rc.6
npm install -g dsh-harmony
dsh web
```

After startup, open **Settings → Harmony** or run `dsh harmony` in another terminal. See [Installation](/guide/installation) for profiles, Desktop integration, updates, and removal.

## Documentation

| Task | Guide |
| --- | --- |
| Understand where Harmony runs | [Runtime architecture](/guide/introduction) |
| Install and configure a profile | [Installation](/guide/installation) |
| Reorder, inspect, disable, and reload | [Operations](/guide/operations) |
| Write a source or semantic Patch | [Patch authoring](/patches/authoring) |
| Patch compiled React trees | [React integration](/integrations/react) |
| Expose editable Studio variables | [Studio integration](/integrations/studio) |
| Look up commands and state files | [CLI reference](/reference/cli) |
| Diagnose a failed Patch | [Troubleshooting](/help/troubleshooting) |

## Runtime model

```text
installed plugin source (unchanged)
  → collect enabled Patch providers
  → resolve provider order and conflicts
  → preflight every source transformation
  → execute the new runtime generation
```

| Stage | Owned by | Guarantee |
| --- | --- | --- |
| Original source | Installed plugin package | Never written by Harmony |
| Patch pipeline | Harmony providers | Deterministic order and exact match checks |
| Runtime generation | Harness Loader | Replaced only after successful preflight |

Browser targets use Harness HMR. Node targets reload through the Loader Tree. Both use the same provider order, Patch state, and inspection trail.

## Related packages

[`dsh-harmony-react`](https://www.npmjs.com/package/dsh-harmony-react) provides typed factories for changing compiled `jsx` and `jsxs` calls. Its optional Studio entry integrates those declarations with [`dsh-webui-studio`](https://github.com/CH4ACKO3/dsh-webui-studio).

## Reference

- [npm package](https://www.npmjs.com/package/dsh-harmony)
- [GitHub repository](https://github.com/CH4ACKO3/dsh-harmony)
- [Limitations](/reference/limitations)
- [MIT License](https://github.com/CH4ACKO3/dsh-harmony/blob/main/LICENSE)
