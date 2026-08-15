# Installation and usage

<p><strong>English</strong> | <a href="./usage.zh-CN.md">简体中文</a> | <a href="../README.en.md">README</a></p>

This guide covers installation, first boot, profile selection, Patch ordering,
inspection, updates, and removal. Patch authoring is introduced at the end; the
complete API examples remain in the project README.

## Choose an installation path

| Path | Use it when | Result |
| --- | --- | --- |
| Global launcher | You control the machine and want Harmony active immediately | `dsh` starts Harmony, then the official CLI |
| Plugin first | You found Harmony through the DSH plugin flow | The bundle installs the launcher on first boot |

Both paths end with the same runtime. Existing `dsh` commands keep their names
and arguments.

## Requirements

- Node.js `22.22.3+` within the 22.x line, or `24.11.1+`
- `@deepseek-ai/dsh@0.1.0-rc.6`
- Windows, macOS, or Linux

Check Node before installing:

```sh
node --version
npm --version
```

## Install the global launcher

Install the supported official Harness version, followed by Harmony:

```sh
npm install -g @deepseek-ai/dsh@0.1.0-rc.6
npm install -g dsh-harmony
```

Start the Web profile normally:

```sh
dsh web
```

The Harmony installer preserves the command name by replacing the global `dsh`
entry with a shim. The shim loads Harmony's CommonJS and ESM transform hooks and
then runs the official CLI with the original arguments. Windows receives
`dsh.cmd` and `dsh.ps1`; macOS and Linux use the `dsh` executable.

Confirm the installation in either of these ways:

```sh
dsh harmony
dsh harmony status
```

`dsh harmony` opens the ordering TUI for the Web profile. In WebUI, Harmony is
available under **Settings → Harmony**.

## Connection model

| Component | Owns | Does not own |
| --- | --- | --- |
| Harmony | Installs Patch hooks before the official CLI runs, then forwards the original arguments | A second Host or a WebUI traffic proxy |
| DSH Host | Serves WebUI assets, `/api` HTTP RPC, and WebSockets | Sessions from another DSH Host |
| WebUI | Connects to the current Host's `/api` through `window.location.origin` | A separately selectable backend URL |
| Desktop | Starts one local Host, reads its readiness URL, and opens that URL in BrowserWindow | A rewritten WebUI or Harness protocol |

The global CLI installation has one path:

```text
system dsh command
  -> Harmony shim
  -> dsh-harmony/bin
  -> @deepseek-ai/dsh/lib/bin.js
  -> dsh web Host
  -> same-origin WebUI + /api + WebSocket
```

Harmony's postinstall alone creates the initial shim and bootstrap state; the
bootstrap plugin only restores the shim after an official DSH upgrade replaces
it. The Harmony runtime no longer rewrites those files. It only resolves the
official CLI from its `@deepseek-ai/dsh` peer dependency.

### Desktop integration

Once Desktop exposes a configurable Host entry, point it at the public
`dsh-harmony/bin` export and bundle `dsh-harmony` beside the built-in
`@deepseek-ai/dsh` in the same Node dependency tree:

```text
Desktop supervisor
  -> dsh-harmony/bin
  -> @deepseek-ai/dsh/lib/bin.js web --host 127.0.0.1 --port 0
  -> readiness URL
  -> BrowserWindow
```

Desktop continues to own the Node executable, Host child process, working
directory, exit handling, and readiness protocol; Harmony only wraps the CLI
entry. Because this path does not use the global installer, it never writes or
modifies the system `dsh` command. The current upstream Desktop still starts its
built-in official CLI directly, so a global Harmony installation cannot affect
Desktop until it exposes that configurable Host entry.

## Install through `dsh plugin`

This path starts from an existing official `dsh` installation:

```sh
dsh plugin --profile web add dsh-harmony
dsh web
```

The installed bundle detects that the Harmony launcher is not active and asks
what to do:

| Choice | Behavior |
| --- | --- |
| Install | Installs the global launcher, exits the current process, and waits for you to run `dsh` again |
| Install and restart | Installs the launcher and restarts the same command and profile immediately |
| Remove plugin | Removes `dsh-harmony` from the current profile |
| Ignore once | Continues this boot without activating the Harmony runtime |

For WebUI, **Install and restart** reloads the page after the restarted process
is ready. For an interactive terminal profile, the same four choices are shown
as a numbered prompt.

Plugins may declare `inject = ['harmony']`. The `harmony` service is intentionally
unavailable until the restarted process has loaded Harmony's module hooks, so a
dependent plugin cannot start in an unpatched process.

## Use normal DSH commands

Harmony does not introduce a second launcher name. The existing CLI continues to
work:

```sh
dsh web
dsh --profile tui
dsh plugin --profile web add some-plugin
dsh plugin --profile web remove some-plugin
```

The selected profile determines which installed providers and targets Harmony
discovers. `dsh harmony` uses the `web` profile by default. Pass a profile name
for any other profile:

```sh
dsh harmony --profile tui
dsh harmony status --profile tui
dsh harmony inspect target-plugin --file lib/index.js --profile tui
```

Each profile stores its independent order and disabled Patch IDs in
`$DSH_HOME/profiles/<name>/harmony.json`.

## Order plugins in WebUI

Start WebUI and open **Settings → Harmony → Plugin order**:

```sh
dsh web
```

The list contains every plugin in the current Loader Tree. Plugins without
Harmony Patches remain visible so the page stays synchronized with the installed
profile, but only Patch providers affect Patch application order.

- Drag a row to move it. Native wheel scrolling continues while a row is held.
- Use the arrow keys to select a row and Alt+Arrow to move it.
- `dsh-harmony` stays fixed at the top.
- **Save** becomes active after the order changes.
- Saving preflights the complete Patch set before committing and hot reloading.
- Closing Settings or changing sections with an unsaved order offers to save,
  discard, or continue editing.

New plugins are appended automatically. Removed plugins disappear from the saved
order.

## Order plugins in the TUI

Open the Web profile's TUI:

```sh
dsh harmony
```

Use `dsh harmony --profile <name>` for another profile.

| Key | Action |
| --- | --- |
| Up / Down or `k` / `j` | Select a plugin |
| `u` / `d` | Move the selected plugin up or down |
| `a` | Find an order with the fewest violated `before`/`after` constraints |
| `r` | Synchronize the list with installed profile dependencies |
| `q`, Escape, or Ctrl+C | Exit |

Moves are saved immediately. If the selected profile is currently running, the
TUI sends the candidate order to that process for preflight and hot reload. If it
is not running, the TUI performs the same preflight locally before changing
`harmony.json`.

The manual order remains authoritative. Automatic sorting minimizes unsatisfied
constraints and keeps the existing order when solutions tie; it does not turn
plugin dependencies into Patch order constraints.

## Inspect Patch status

List all Patches for the Web profile:

```sh
dsh harmony status
```

Select another profile with `--profile`:

```sh
dsh harmony status --profile tui
```

Each line contains the Patch state, stable `provider/id` key, target package, and
target file. States are:

| State | Meaning |
| --- | --- |
| `pending` | Collected but not yet bound to a loaded target |
| `bound` | Applied to the current target generation |
| `disabled` | Disabled in the profile's Harmony state |
| `failed` | Collection, target resolution, matching, or application failed |

`status` exits with code `1` when any Patch failed, which makes it suitable for a
release or CI check. Failure output includes the Patch key and target details.

In WebUI, open **Settings → Harmony → Patch status** to see the same data,
including match count and generation. Enabling or disabling a Patch uses the
same transactional preflight and hot-reload path as ordering.

## Inspect transformed source

Inspect one target package and file:

```sh
dsh harmony inspect some-dsh-plugin --file lib/index.js
```

The output contains:

1. the original source read from the installed package;
2. the source after each Patch, in provider order;
3. the final transformed source.

Omit `--file` to inspect every patched file in the package. Omit both filters to
print all collected inspections:

```sh
dsh harmony inspect some-dsh-plugin
dsh harmony inspect
```

Inspection never writes the transformed source back to the target package.

## Runtime updates and hot reload

Harmony watches the profile manifest, `harmony.json`, and declared Patch provider
files. It rebuilds affected Loader groups when providers, order, enablement, or
provider source changes.

Before committing an update, Harmony applies the complete ordered Patch set to
all affected targets. A failed preflight keeps the previous Loader Tree and
profile state. Successful browser target changes use Harness's existing HMR path
for `lib/client.js`; Node targets reload through the Loader Tree.

Relative ESM imports inside the target package inherit the same generation.
CommonJS reloads invalidate the target package's internal `require` graph.

## Update Harmony or DSH

Update Harmony with npm:

```sh
npm install -g dsh-harmony@latest
```

If a later official DSH installation or upgrade takes ownership of the `dsh`
command again, start the affected profile normally:

```sh
dsh web
```

Harmony's bootstrap bundle restores the shim and WebUI displays a restart banner.
Choose **Restart now** to close the current Loader Tree and restart the same
command through Harmony.

When changing the official DSH version, keep it within the peer dependency range
declared by the installed Harmony release.

## Remove Harmony

Remove the profile bundle first, followed by the global package:

```sh
dsh plugin --profile web remove dsh-harmony
npm uninstall -g dsh-harmony
dsh web
```

Repeat the first command for every profile that contains the bundle. The shim
delegates directly to the existing official CLI once the Harmony package is gone,
and the bootstrap entry removes itself on a later official boot. Target plugin
files need no restoration because Harmony never writes transformed source to
disk.

If the global package was removed first, start the remaining profile and choose
**Remove plugin** when prompted.

## Add Harmony Patches to a plugin

Declare CommonJS Patch modules in the provider's `package.json`:

```json
{
  "name": "my-dsh-plugin",
  "dsh": {
    "harmony": {
      "patches": ["./patches/answer.patch.cjs"],
      "after": ["base-patches"],
      "before": ["ui-patches"],
      "conflicts": ["legacy-patches"]
    }
  }
}
```

Create a source Patch with a TSQuery selector:

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

Source Patches use TSQuery and MagicString. Semantic Patches target a named
function or class method and use `before`, `after`, `around`, or `replace`.
Browser `lib/client.js` targets must use source Patches because semantic handlers
execute in the Node process.

`conflicts` lists Harmony Patch provider package names that should produce a
warning when both sides are enabled. The declaration does not block installation,
loading, Patch application, or hot reload, and it does not affect sorting.

Use DSH's existing dependency mechanism when the provider itself must not start
without Harmony:

```ts
export const inject = ['harmony']
```

See [Declare patches](../README.en.md#declare-patches) for the full source and
semantic API, ordering rules, and conflict behavior.

## Troubleshooting

### The plugin is installed but the launcher is not active

Choose **Install and restart** on WebUI, or install the runtime directly:

```sh
npm install -g dsh-harmony
```

### `dsh harmony status` exits with code 1

Read the `failed` entry printed beneath the Patch key. It identifies the target
package or file and reports selector count, version, or application failures.
Use `dsh harmony inspect <package> --file <file>` to compare each intermediate
source result.

### Automatic sorting still reports violations

The declared `before` and `after` constraints conflict. The automatic sorter
returns the order with the fewest violations and reports the providers involved.
Change the manual order or update the conflicting provider declarations.

### A Harmony-dependent plugin does not start on first boot

Finish launcher installation and restart. This is expected: the `harmony`
service is published only by a process that started with the runtime hooks active.
