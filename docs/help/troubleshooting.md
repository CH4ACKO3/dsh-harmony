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

The target's compiled structure changed. Inspect the original source, update the TSQuery selector, then update the Patch's `target.version`. Keep `expect` exact rather than accepting an unknown number of matches.

## Automatic sorting still reports violations

The declared `before` and `after` constraints conflict. Automatic sorting returns an order with the fewest violations and names the providers involved. Change the manual order or correct the provider declarations.

## A dependent plugin does not start on first boot

Finish launcher installation and restart. This is expected: the `harmony` service is published only by a process that started with module hooks active.

## An official DSH update replaced the shim

Start the affected profile normally. Harmony's bootstrap bundle restores the launcher and WebUI offers **Restart now**. The restarted process loads the hooks before the Loader Tree.

## A hot update failed

Harmony keeps the previous generation. Open **Patch status** or run `status`, correct the provider, and save or reload again. A failed transaction does not require restoring target files.

## Desktop ignores a global Harmony installation

The upstream Desktop currently starts its built-in CLI directly. Global command shims cannot affect it. Desktop must expose a configurable Host entry that points at `dsh-harmony/bin`; use `DSH_HARMONY_DSH_ENTRY` when its built-in DSH lives in a separate dependency tree.

## Removing Harmony left a profile prompt

The global package was removed before the profile bundle. Start the profile and choose **Remove plugin**, or remove it explicitly:

```sh
dsh plugin --profile <name> remove dsh-harmony
```

For unresolved problems, open a [GitHub issue](https://github.com/CH4ACKO3/dsh-harmony/issues) with the DSH version, Node version, profile name, failing stable Patch key, and relevant `status` output.
