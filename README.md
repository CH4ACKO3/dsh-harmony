<p align="center"><strong>English</strong> | <a href="./README.zh-CN.md">简体中文</a></p>

<p align="center">
  <img src="./assets/harmony-icon.png" alt="dsh-harmony" width="180"><br>
  <strong>dsh-harmony</strong><br>
  A library for patching, replacing and decorating<br>
  DeepSeek Harness plugins during runtime.
</p>

## About

dsh-harmony lets one DSH plugin alter another plugin without maintaining a fork
or writing transformed source back to the installed package. It installs the
usual `dsh` executable, starts the official Harness, and applies the complete
Patch set before target plugins load.

Inspired by [Harmony for C# and .NET](https://github.com/pardeike/Harmony), this
project brings coordinated runtime patching to the DeepSeek Harness plugin
ecosystem.

## How it works

When code is loaded into DSH as a plugin, Harmony can change its behavior while
keeping the installed files intact. It provides:

- TypeScript AST transforms before a plugin module executes
- `before`, `after`, `around`, and `replace` operations for named functions
- One explicit order shared by source and semantic Patches
- Transactional preflight, conflict reporting, rollback, and hot reload
- Multiple Patch providers that can target the same plugin without maintaining
  separate forks

<p align="center">
  <img src="./assets/harmony-preview-light.png" alt="Harmony plugin order in DeepSeek Harness" width="680">
</p>

## Install

### Requirements

| Component | Supported version |
| --- | --- |
| Node.js | `^22.22.3` or `>=24.11.1` |
| DeepSeek Harness | `@deepseek-ai/dsh@0.1.0-rc.6` |
| Operating system | Windows, macOS, or Linux |

### Global launcher

This is the recommended path. Install the official CLI first, then Harmony:

```sh
npm install -g @deepseek-ai/dsh@0.1.0-rc.6
npm install -g dsh-harmony
dsh web
```

Harmony replaces the global command entry with a small persistent shim. The same
JavaScript launcher is used on every platform. macOS and Linux expose it as the
`dsh` executable; Windows adds the native `dsh.cmd` and `dsh.ps1` entry points
used by Command Prompt and PowerShell. Harmony starts the official CLI after
installing its runtime hooks, so existing commands do not change:

```sh
dsh web
dsh --profile tui
dsh plugin --profile web add ./my-plugin
```

Open **Settings → Harmony** in WebUI, or run `dsh harmony`, to confirm that the
runtime is active.

### Plugin first

Harmony is also a normal Harness bundle and can be discovered and installed
through the existing plugin command:

```sh
dsh plugin --profile web add dsh-harmony
dsh web
```

On first boot, choose **Install and restart**. Harmony installs the global
launcher, gracefully closes the current process, restarts the same profile with
runtime patching enabled, and reloads WebUI when the new process is ready.

WebUI and interactive terminal boots offer four choices when the bundle is
installed but the launcher is missing: **Install**, **Install and restart**,
**Remove plugin**, and **Ignore once**. **Install** exits after installation so
you can start `dsh` again yourself. The `harmony` service is provided only after
a restarted process has loaded the patch hooks, so dependent plugins cannot
start against an unpatched runtime.

If the official package is installed or upgraded later and takes back the
`dsh` command, Harmony's bootstrap plugin restores the shim on the next normal
profile start. WebUI shows a restart banner; **Restart now** gracefully closes
the current Loader tree, launches the same command through Harmony, and reloads
the page when the new process is ready. The running Node process is never
switched between launchers midway through boot.

Every boot collects patches declared by the selected profile's installed
dependencies before Harness plugins are loaded. A patch provider discovered by a
later Loader update is collected immediately and its target entries are reloaded.
Reload generations propagate through relative imports inside the same target
package, so an entry and its internal ESM dependency graph use one Patch set.
CommonJS entries invalidate their same-package `require` graph before reload.

## Documentation

- [Installation and usage guide](./docs/usage.md)
- [Patch declaration and API](#declare-patches)
- [Patch ordering and inspection](#patch-order)
- [GitHub Issues](https://github.com/CH4ACKO3/dsh-harmony/issues)

## Patch order

In `dsh web`, open **Settings → Harmony → Plugin order**. The page mirrors the
current Loader tree, including ordinary plugins that do not declare Harmony
patches. Drag rows to reorder them, or use the arrow keys to select and
Alt+Arrow to move the selected row. The list keeps native wheel scrolling while
a row is held. `dsh-harmony` stays fixed at the top of the list. While Harmony is
active, the official Settings dialog is widened for every settings page. Saving
persists the profile order and reloads affected patch targets. Closing Settings
or switching sections with an unsaved draft offers to save, discard, or keep
editing.

Open the Harmony TUI for the Web profile:

```sh
dsh harmony
```

Use `--profile <name>` for another profile. Arrow keys select a plugin,
`u` and `d` move it, `a` computes an order with the fewest violated constraints,
`r` synchronizes the installed plugin list, and `q` exits. Every move is saved
immediately. When the Web profile is running, the TUI sends the candidate order
to that process for preflight and hot reload; otherwise it preflights locally
before changing `harmony.json`. Newly installed plugins are appended and
uninstalled ones are removed automatically.

The adjacent **Patch status** page shows every stable Patch ID, target, binding
state, match count, generation and error. A Patch can be disabled or enabled
there; the change uses the same preflight and hot-reload transaction as ordering.
For terminal inspection:

```sh
dsh harmony status
dsh harmony inspect some-dsh-plugin --file lib/index.js
```

`inspect` prints the original source, every intermediate Patch result, and the
final transformed source without changing the installed package.

The runtime watches both `package.json` and `harmony.json`. A changed provider
set or order rebuilds affected Loader groups with the complete patch set; source
files on disk remain untouched. Order saves, enable/disable changes, provider
file updates and Loader-tree changes share one serialized transaction queue, so
a failed rollback cannot overwrite a newer committed update.

Targets whose file is `lib/client.js` use Harness's own `clientModules.rebuilt`
path instead. It recalculates the transformed bundle revision and sends the
existing HMR event, so an open WebUI reloads only the changed client plugin.

## Declare patches

Add patch files to the provider plugin's `package.json`:

```json
{
  "name": "my-dsh-plugin",
  "dsh": {
    "harmony": {
      "patches": ["./patches/answer.patch.cjs"],
      "after": ["base-patches"],
      "before": ["ui-patches"]
    }
  }
}
```

Patch files are CommonJS modules so they can be collected by Node's synchronous
module loader during a live plugin update:

```js
/** @type {import('dsh-harmony').HarmonyPatch} */
module.exports = {
  id: 'answer-value',
  target: {
    package: 'some-dsh-plugin',
    version: '^1.2.0',
    files: ['lib/index.js'],
  },
  select: 'FunctionDeclaration[name.name="answer"] NumericLiteral',
  expect: 1,
  apply({ node, sourceFile, edit }) {
    edit.overwrite(node.getStart(sourceFile), node.getEnd(), '42')
  },
}
```

The selector uses [TSQuery](https://github.com/phenomnomnominal/tsquery). The
callback receives the matched TypeScript AST node and a
[MagicString](https://github.com/Rich-Harris/magic-string) editor. All positions
passed to `edit` refer to the source received by that patch, including changes
made by earlier providers. `files` lists alternative package-relative targets;
the first existing file is used. `version` is a semver range, and `expect`
requires an exact selector match count.

For named function declarations and class methods, a semantic Patch can decorate
calls without writing an AST edit:

```js
module.exports = {
  id: 'answer-after',
  target: {
    package: 'some-dsh-plugin',
    version: '^1.2.0',
    files: ['lib/index.js'],
    function: 'answer',
  },
  operation: 'after',
  handler({ result }) {
    return result + 1
  },
}
```

The available operations are `before`, `after`, `around`, and `replace`.
`before` may return a replacement argument array; `after` may replace the sync
or async result; `around` and `replace` receive `invoke(args?)`. Two enabled
`replace` patches for the same function are reported as a conflict. Semantic
targets currently accept named parameters and do not support generators.
Handlers execute in the Node process, so browser `lib/client.js` targets continue
to use source patches. All `before` handlers run in Patch order, then
`around`/`replace` handlers form an outer-to-inner chain in Patch order, and all
`after` handlers run in Patch order. Source and semantic patches also share the
same global order rather than running in separate phases.

`before` and `after` belong to the provider's `dsh.harmony` declaration and
refer to other provider package names. They are sorting constraints, not npm or
Cordis dependencies. The manual list remains authoritative; the TUI highlights
violations and its automatic sort finds a minimum-violation order while keeping
the existing order when solutions tie.

Patches from each provider run in declaration order. Providers run in the
profile's manual order, and every later patch receives the source produced by
the earlier patches. If an earlier provider removes code selected by a later
provider, the error names both providers, the target file, and the selector.

The same mechanism applies to host bundles such as `lib/index.js` and browser
bundles such as `lib/client.js`.

Node.js `22.22.3+` within the 22.x line or `24.11.1+` is required because Harmony
uses Node's synchronous CommonJS and ESM module hooks as one transform path.

## Limitations

- Patch provider files must be CommonJS modules so live Loader updates can
  collect them synchronously.
- Semantic Patches target named function declarations and class methods. Their
  parameters must be named identifiers, and generators are not supported.
- Semantic handlers run in Node.js. Browser targets such as `lib/client.js` must
  use source Patches.
- Two enabled `replace` Patches cannot target the same function; the transaction
  is rejected as a conflict.
- Source selectors depend on the compiled shape of the target plugin and may
  need updating when that plugin changes.

## Depend on Harmony

The launcher adds a normal Cordis plugin that provides the `harmony` service. A
plugin can use Harness's existing dependency mechanism:

```ts
export const inject = ['harmony']

export function apply(ctx) {
  // dsh-harmony is active when this plugin starts.
}
```

Or declare the dependency on its Loader row:

```yaml
- id: my-plugin
  inject: [harmony]
```

Harmony never writes patched source back into another plugin. Its command shim
uses Harmony while the package is installed and falls back to the existing
official CLI as soon as Harmony is removed. Remove the profile bundle before
removing the global runtime; if the runtime is removed first, the remaining
profile plugin offers **Remove plugin** on its next start:

```sh
dsh plugin --profile web remove dsh-harmony
npm uninstall -g dsh-harmony
dsh web
```

## Feedback

Report bugs, Patch conflicts, and feature requests in
[GitHub Issues](https://github.com/CH4ACKO3/dsh-harmony/issues).

## License

dsh-harmony is available under the [MIT License](./LICENSE).

<p align="center">
  <a href="https://www.npmjs.com/package/dsh-harmony"><img src="https://img.shields.io/npm/v/dsh-harmony.svg?style=flat-square&label=npm" alt="npm version"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/dsh-harmony.svg?style=flat-square&label=License" alt="MIT License"></a>
  <a href="./docs/usage.md"><img src="https://img.shields.io/badge/Documentation-Guide-4b8bbe?style=flat-square" alt="Documentation"></a>
</p>
<p align="center">
  <a href="https://www.npmjs.com/package/dsh-harmony"><img src="https://img.shields.io/npm/dm/dsh-harmony.svg?style=flat-square&label=Downloads" alt="npm downloads"></a>
  <a href="https://github.com/CH4ACKO3/dsh-harmony/actions/workflows/ci.yml"><img src="https://github.com/CH4ACKO3/dsh-harmony/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>
<p align="center">
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-22.22.3%2B%20%7C%2024.11.1%2B-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 22 or 24"></a>
  <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/DSH-0.1.0--rc.6-1f6feb?style=flat-square" alt="DeepSeek Harness 0.1.0-rc.6"></a>
</p>
