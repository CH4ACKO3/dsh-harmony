# Order, inspect, and reload

WebUI and the terminal edit the same profile. It stores a provider order for whole-group moves and a global Patch order for individual placement.

## Order Patches in WebUI

Start WebUI and open **Settings → Harmony → Application order**:

```sh
dsh web
```

Harmony stores one flat `patchOrder`. The UI draws consecutive Patches from the same provider as a stack, but the stack is only a visual grouping.

- A collapsed provider shows a cover and one layer for each Patch. Click anywhere down to the bottom card to spread the stack into ordinary Patch cards. It folds again shortly after the pointer leaves the cards' vertical range.
- Drag a collapsed stack to move its consecutive Patches together, or drag one Patch into another provider's run. A blue line marks the insertion point. During a drag, hovering over a collapsed stack opens it after a short delay, and the mouse wheel still scrolls the list.
- Long-press a card or stack without moving it to bring every Patch from that provider to this position and restore their declaration order.
- Click an individual Patch to inspect its target and status. Selecting one Patch leaves its provider visible at full width and shortens other providers, without replacing status colors.
- Plugin details expose **Disable plugin Patches** or **Enable plugin Patches**. Patch details expose the equivalent individual action. These changes are drafts, just like sorting: **Undo** restores the saved state and **Save** preflights the complete order and enablement update before committing and reloading.

Disabled cards are gray, warnings amber, and failures muted red. A collapsed cover summarizes the active members; disabled Patches do not contribute to cover health, and a provider whose Patches are all disabled is fully gray.

Plugin-wide disablement is an independent `provider/*` flag. It does not change the stored flags for individual Patches. Re-enabling a plugin therefore leaves Patches that were already individually disabled in that state.

When providers add or remove Patches, Harmony inserts new entries according to provider order and drops entries that no longer exist. `dsh-harmony` itself does not appear as a Patch card.

## Order plugins in the terminal

Open the Web profile's TUI:

```sh
dsh harmony
```

Use `dsh harmony --profile <name>` for another profile.

Press `Tab` to switch between Provider and Patch views.

| Key | Action |
| --- | --- |
| Up / Down or `k` / `j` | Select a Provider or Patch |
| `u` / `d` | Move the selected item |
| Space | Enable or disable the selected Patch |
| `p` | Enable or disable its Provider without changing individual Patch flags |
| `a` | Find an order with the fewest violated constraints |
| `i` | Inspect the selected Patch |
| `r` | Reload from the running Host |
| `q`, Escape, or Ctrl+C | Exit |

Provider view moves whole providers and regroups their Patches. Patch view controls individual placement and enablement. Each action is checked and saved immediately. For a running profile, the TUI asks the Host to commit and hot-reload; for a stopped profile, it validates locally before writing `harmony.json`.

Manual order wins. Automatic sorting minimizes violated `before` and `after` rules while keeping the current relative order when several results are equally good.

## Declared order and user order

Provider declarations set the default order. If a Patch declares its own `before` or `after`, those rules replace the provider rules for that Patch. Harmony turns the resulting relationships into one list; it does not assign numeric priorities.

The user can override unresolved or incompatible relationships at two levels:

- moving a provider regroups all owned Patches;
- moving one Patch preserves its exact position, including between Patches from another provider.

Harmony shows violated ordering rules but does not reject the user's order for that reason. It does reject a list that omits, repeats, or invents a Patch. If applying the order later fails, Harmony skips a failed standalone Patch or discards every member of a failed composite.

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

`status` exits with code `1` if any Patch failed, making it suitable for CI or release checks. In WebUI, **Settings → Harmony → Patch status** is the same information as a read-only runtime monitor. Its visible label for `bound` is **Enabled**; change enablement from the details in **Application order**.

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

Harmony watches the Loader profile, `harmony.json`, and provider files. It handles provider changes, Patch edits, ordering, enablement, and Loader Tree updates one transaction at a time. Whole-profile writes use the same model as DSH Settings: a file lock serializes commits, a stale WebUI draft is rejected and refreshed, and concurrent processes use last-complete-write-wins semantics.

Before committing, Harmony tries the saved Patch order on every affected target. A standalone Patch that cannot match or apply is marked `failed` and skipped; later Patches and the Host keep running. If a composite member fails, Harmony applies none of that composite. A provider import or target reload failure keeps the previous runtime and profile settings. Transactions are serialized, so an older rollback cannot overwrite a newer update.

A Patch reaches `failed` after its declaration loads but its target cannot be changed. Common causes are a missing package, version, or file; a selector count that disagrees with `expect`; an exception from `apply()`; an unsupported Semantic target; or a second semantic `replace` on the same function. Provider import errors, duplicate Patch IDs, and target reload errors fail the whole transaction instead.

Node target changes rebuild the affected Loader groups. Browser target changes use Harness HMR and reload only the changed client plugin.

Harmony orders provider-owned `<style data-plugin>` tags from the enabled Patch list. Even when its Patches are split apart, a provider still owns one CSS group, placed at its last enabled Patch. After reload, Harmony moves those provider styles again without disturbing unrelated page styles.

## Conflict visibility

Harmony reports these conflicts:

- selector counts that differ from `expect`;
- two enabled semantic `replace` operations on the same function;
- a target removed by an earlier source Patch;
- missing requirements or incompatible active plugins declared through `dsh.plugin.compatibility`;
- constraints that the current manual order violates.

Warnings name the provider, stable Patch key, target package, and target file. Use `status` to locate the skipped Patch, then `inspect` to compare its input with the output of earlier providers. `status` exits with code `1` while any Patch is failed even though the Host remains available.
