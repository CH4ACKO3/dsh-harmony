# Order, inspect, and reload

Harmony gives WebUI and the terminal the same profile order, Patch status, and transactional update path.

## Order plugins in WebUI

Start WebUI and open **Settings → Harmony → Plugin order**:

```sh
dsh web
```

The list mirrors every plugin in the current Loader Tree. Plugins without Harmony Patches remain visible so ordering stays aligned with the installed profile, but only Patch providers affect application order.

- Drag a row to move it; native wheel scrolling continues while the row is held.
- Use the arrow keys to select a row and Alt+Arrow to move it.
- `dsh-harmony` stays fixed at the top.
- Saving preflights the complete Patch set before committing and reloading.
- Closing Settings or changing sections with an unsaved draft offers to save, discard, or keep editing.

New plugins are appended automatically. Removed plugins disappear from the saved order.

## Order plugins in the terminal

Open the Web profile's TUI:

```sh
dsh harmony
```

Use `dsh harmony --profile <name>` for another profile.

| Key | Action |
| --- | --- |
| Up / Down or `k` / `j` | Select a plugin |
| `u` / `d` | Move the selected plugin |
| `a` | Find an order with the fewest violated constraints |
| `r` | Synchronize with installed profile dependencies |
| `q`, Escape, or Ctrl+C | Exit |

Moves save immediately. If the profile is running, the TUI asks that process to preflight and hot-reload the candidate order. Otherwise it performs the same preflight locally before writing `harmony.json`.

The manual order remains authoritative. Automatic sorting minimizes violated `before` and `after` constraints and preserves existing order when solutions tie.

## Inspect Patch status

```sh
dsh harmony status
dsh harmony status --profile tui
```

Each entry includes the stable `provider/id` key, target, binding state, match count, and generation.

| State | Meaning |
| --- | --- |
| `pending` | Collected but not yet bound to a loaded target |
| `bound` | Applied to the current generation |
| `disabled` | Disabled in this profile |
| `failed` | Collection, resolution, matching, or application failed |

`status` exits with code `1` if any Patch failed, making it suitable for CI or release checks. In WebUI, **Settings → Harmony → Patch status** exposes the same information and lets you enable or disable individual Patches.

## Inspect transformed source

Inspect one target file:

```sh
dsh harmony inspect some-dsh-plugin --file lib/index.js
```

The output contains the original source, the source after each Patch in provider order, and the final transformed source. Broaden the query by omitting filters:

```sh
dsh harmony inspect some-dsh-plugin
dsh harmony inspect
```

Inspection never writes transformed source to the target package.

## Transactional updates

Harmony watches the Loader profile, `harmony.json`, and declared provider files. Provider additions, Patch edits, order changes, enablement changes, and Loader-tree updates enter one serialized transaction queue.

Before commit, Harmony applies the complete ordered Patch set to every affected target. A failed preflight preserves the previous runtime generation and profile state, so an older rollback cannot overwrite a newer committed update.

Node target changes rebuild the affected Loader groups. Browser target changes use Harness HMR and reload only the changed client plugin.

## Conflict visibility

Harmony reports:

- selector counts that differ from `expect`;
- two enabled semantic `replace` operations on the same function;
- a target removed by an earlier source Patch;
- incompatible providers declared through `conflicts`;
- constraints that the current manual order violates.

Errors name the provider, stable Patch key, target package, and target file. Use `status` to locate the failing Patch, then `inspect` to compare its input with the output of earlier providers.
