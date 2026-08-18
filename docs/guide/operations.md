# Order, inspect, and reload

Harmony gives WebUI and the terminal the same profile state, Patch status, and transactional update path. The profile contains both coarse provider order and the exact global Patch order.

## Order Patches in WebUI

Start WebUI and open **Settings → Harmony → Plugin order**:

```sh
dsh web
```

The underlying model is one flat `patchOrder`. The UI dynamically reconciles consecutive Patches from the same provider into a visual stack; stacking never changes the order itself.

- A collapsed provider is rendered as a cover plus one layer for every owned Patch. Click the visible stack area to expand it into flat Patch cards; moving outside the expanded run's vertical range collapses it after a short delay.
- Drag a collapsed stack to move all consecutive cards together, or drag one Patch to interleave it with another provider. A blue insertion line marks the nearest gap. Hovering over a collapsed stack during a drag expands it after a short delay, and native wheel scrolling remains available.
- Long-press a card or stack without dragging to recall every Patch from that provider to the current position and restore provider declaration order.
- Click an individual Patch to inspect its target and status. Selecting one Patch leaves its provider visible at full width and shortens other providers, without replacing status colors.
- **Undo** restores the last saved Patch order; **Save** preflights the complete permutation before committing and reloading.

Disabled cards are gray, warnings amber, and failures muted red. A collapsed cover summarizes the active members; disabled Patches do not contribute to cover health, and a provider whose Patches are all disabled is fully gray.

New Patches are reconciled into the saved provider order. Removed Patches disappear. `dsh-harmony` itself is not a Patch card in this list.

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

The terminal TUI intentionally remains provider-level. Moves save immediately and regroup each provider's Patches in `patchOrder`. If the profile is running, the TUI asks that process to preflight and hot-reload the candidate order. Otherwise it performs the same preflight locally before writing `harmony.json`.

The manual order remains authoritative. Automatic sorting minimizes violated provider-level `before` and `after` constraints and preserves existing order when solutions tie. Use WebUI for Patch-level interleaving.

## Declared order and user order

Provider declarations supply a coarse default. A Patch that defines its own `before` or `after` replaces that provider-wide rule for itself. Harmony resolves those relationships into one global list without numeric priorities.

The user can override unresolved or incompatible relationships at two levels:

- moving a provider regroups all owned Patches;
- moving one Patch preserves its exact position, including between Patches from another provider.

Constraint violations are status information, not a reason to reject a manual order. Saving rejects an incomplete, duplicated, or unknown Patch permutation. Transformation failures follow the isolation rules below: an independent Patch is skipped, while a failing composite is rolled back as one unit.

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

The output contains the original source, the source after each Patch in global Patch order, and the final transformed source. Broaden the query by omitting filters:

```sh
dsh harmony inspect some-dsh-plugin
dsh harmony inspect
```

Inspection never writes transformed source to the target package.

## Transactional updates

Harmony watches the Loader profile, `harmony.json`, and declared provider files. Provider additions, Patch edits, order changes, enablement changes, and Loader-tree updates enter one serialized transaction queue.

Before commit, Harmony applies the complete ordered Patch set to every affected target. A standalone Patch that cannot match or apply is marked `failed`, logged as skipped, and does not stop later Patches or the Host. If one member of a composite fails, none of that composite's members apply. Provider declaration failures and target reload failures still preserve the previous runtime generation and profile state, so an older rollback cannot overwrite a newer committed update.

A failed Patch is a declaration that loaded successfully but cannot safely transform its current target: for example, the target package, version, or file is unavailable; `select` and `expect` do not agree with the compiled source; `apply()` throws; a Semantic Patch targets an unsupported shape; or a later `replace` conflicts with the first replacement. Failure to import a Patch plugin, duplicate Patch IDs, and failure to reload the target plugin are transaction failures instead, so Harmony rolls back the candidate generation.

Node target changes rebuild the affected Loader groups. Browser target changes use Harness HMR and reload only the changed client plugin.

Harmony also projects the final enabled Patch order onto provider-owned `<style data-plugin>` tags. One provider owns one CSS group even when its Patches are interleaved, so the provider's last enabled Patch determines its cascade position. Style tags are re-synchronized after reload without moving unrelated page styles out of their existing slots.

## Conflict visibility

Harmony reports:

- selector counts that differ from `expect`;
- two enabled semantic `replace` operations on the same function;
- a target removed by an earlier source Patch;
- incompatible providers declared through `conflicts`;
- constraints that the current manual order violates.

Warnings name the provider, stable Patch key, target package, and target file. Use `status` to locate the skipped Patch, then `inspect` to compare its input with the output of earlier providers. `status` exits with code `1` while any Patch is failed even though the Host remains available.
