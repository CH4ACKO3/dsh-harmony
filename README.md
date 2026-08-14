# dsh-harmony

![dsh-harmony](assets/harmony-preview-light.png)

A library for patching, replacing and decorating dsh plugin during runtime. It
installs the usual `dsh` executable, starts the official Harness, and keeps target
plugin files unchanged on disk.

## Install

```sh
npm install -g dsh-harmony
```

Install the official `@deepseek-ai/dsh` globally first. Harmony's installer
replaces its command entry with a small persistent shim. The same JavaScript
launcher is used on every platform. macOS and Linux expose it as the executable
`dsh`; Windows adds the native `dsh.cmd` and `dsh.ps1` entry points used by
Command Prompt and PowerShell. After installation, use `dsh` exactly as before:

```sh
dsh web
dsh --profile tui
dsh plugin --profile web add ./my-plugin
```

`dsh-harmony` is also a real Harness bundle. If that bundle is copied into a
profile before the global runtime exists, WebUI and interactive terminal boots
offer four choices: **Install**, **Install and restart**, **Remove plugin**, and
**Ignore once**. The `harmony` service is provided only after a restarted process
has loaded the patch hooks, so dependent plugins cannot start against an
unpatched runtime.

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
