# Troubleshooting

## The bundle is installed but Harmony is inactive

Choose **Install and restart** on first boot, or install the launcher directly:

```sh
npm install -g dsh-harmony
```

Then restart the same profile and verify:

```sh
dsh harmony status
```

## `status` exits with code 1

Find the `failed` entry beneath its stable Patch key. The error identifies the package, file, selector count, version mismatch, or application failure.

Inspect that target to compare every intermediate source result:

```sh
dsh harmony inspect <package> --file <file>
```

## A selector no longer matches

The target's compiled structure changed. Inspect the original source and update the TSQuery selector, then adjust `target.version` to the versions you tested. Set `expect` to the match count you found instead of accepting an unknown count.

## Automatic sorting still reports violations

The declared `before` and `after` constraints conflict. Automatic sorting returns an order with the fewest violations and names the providers involved. Correct the declarations, move the provider, or use WebUI to place one Patch precisely. A Patch-level relation replaces its provider-wide rule rather than appending to it.

## A patched function works after its declaration but fails before it

`component()` rewrites a named function declaration as `const` so later Component Patches can change the same binding. The new binding is not hoisted. Use a core Source Patch instead, or make sure the target first reads the component after its declaration.

## A dependent plugin does not start on first boot

Finish launcher installation and restart. This is expected: the `harmony` service is published only by a process that started with module hooks active.

## An official DSH update replaced the shim

Start the affected profile normally. Harmony's bootstrap bundle restores the launcher and WebUI offers **Restart now**. The restarted process loads the hooks before the Loader Tree.

## A hot update failed

Harmony keeps the previous generation. Open **Patch status** or run `status`, correct the provider, and save or reload again. A failed transaction does not require restoring target files.

## Desktop ignores a global Harmony installation

Desktop starts its built-in CLI directly, so the global command shim cannot affect it. Desktop must provide a configurable Host entry that points to `dsh-harmony/bin`. If its built-in DSH is in another dependency tree, also set `DSH_HARMONY_DSH_ENTRY`.

## Removing Harmony left a profile prompt

The global package was removed before the profile bundle. Start the profile and choose **Remove plugin**, or remove it explicitly:

```sh
dsh plugin --profile <name> remove dsh-harmony
```

For unresolved problems, open a [GitHub issue](https://github.com/memorax-ai/dsh-harmony/issues) with the DSH version, Node version, profile name, failing stable Patch key, and relevant `status` output.
