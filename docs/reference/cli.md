# CLI and configuration

Harmony adds one command group to the existing `dsh` launcher.

## Commands

### `dsh harmony`

Open the plugin-order TUI. The Web profile is the default.

```sh
dsh harmony
dsh harmony --profile tui
```

### `dsh harmony status`

Print every collected Patch and its state. The command exits with code `1` when any Patch has failed.

```sh
dsh harmony status
dsh harmony status --profile tui
```

### `dsh harmony inspect`

Print original, intermediate, and final source for collected targets.

```sh
dsh harmony inspect
dsh harmony inspect some-dsh-plugin
dsh harmony inspect some-dsh-plugin --file lib/index.js
```

All commands accept `--profile <name>`.

## Profile state

Each profile stores Harmony state at:

```text
$DSH_HOME/profiles/<name>/harmony.json
```

The file contains `order`, `patchOrder`, and `disabled`:

- `order` is the coarse provider list used by the terminal TUI;
- `patchOrder` is the complete ordered permutation of stable Patch keys used at runtime;
- `disabled` contains individual `provider/id` keys or provider-wide `provider/*` entries.

Harmony synchronizes the state with installed declarations: new providers and Patches are reconciled into the order, while removed entries disappear.

Do not edit the file while the profile is running. Use Web Settings or the TUI so the candidate state is preflighted and committed transactionally.

## Provider metadata

Provider configuration belongs under `dsh.harmony` in `package.json`:

```json
{
  "dsh": {
    "harmony": {
      "patches": ["./patches/a.cjs", "./patches/b.cjs"],
      "after": ["provider-a"],
      "before": ["provider-c"],
      "conflicts": ["legacy-provider"]
    }
  }
}
```

| Field | Meaning |
| --- | --- |
| `patches` | CommonJS Patch modules in declaration order |
| `before` | Provider package names this provider prefers to precede |
| `after` | Provider package names this provider prefers to follow |
| `conflicts` | Provider package names that produce an incompatibility warning |

One Patch may also define `before` and `after`. Defining either field replaces the provider-wide rule for that Patch.

## Environment

| Variable | Purpose |
| --- | --- |
| `DSH_HOME` | Overrides the Harness home that contains profiles and Harmony state |
| `DSH_HARMONY_DSH_ENTRY` | Selects an explicit official `@deepseek-ai/dsh/lib/bin.js`, primarily for Desktop integration |

## Stable Patch keys

Harmony combines the provider package name and Patch `id` into a stable key:

```text
provider-package/patch-id
```

Status output, enablement, inspection, dependencies, and errors use this key. Disabling `<provider>/*` disables the whole provider and removes its active conflict warnings.
