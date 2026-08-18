# Installation

## Requirements

| Component | Supported version |
| --- | --- |
| Node.js | `^22.22.3` or `>=24.11.1` |
| DeepSeek Harness | `@deepseek-ai/dsh@0.1.0-rc.6` |
| Operating system | Windows, macOS, or Linux |

Check Node before installing:

```sh
node --version
npm --version
```

## Recommended: global launcher

Install the supported official CLI, followed by Harmony:

```sh
npm install -g @deepseek-ai/dsh@0.1.0-rc.6
npm install -g dsh-harmony
dsh web
```

Harmony preserves the `dsh` command name with a small persistent shim. macOS and Linux use the `dsh` executable; Windows receives native `dsh.cmd` and `dsh.ps1` entry points. Existing commands and arguments stay unchanged:

```sh
dsh web
dsh --profile tui
dsh plugin --profile web add ./my-plugin
```

Confirm the runtime with either interface:

```sh
dsh harmony
dsh harmony status
```

In WebUI, open **Settings → Harmony**.

## Alternative: install the plugin first

If you discover Harmony through the DSH plugin flow, install its bundle first:

```sh
dsh plugin --profile web add dsh-harmony
dsh web
```

The first boot presents four choices:

| Choice | Behavior |
| --- | --- |
| Install | Installs the launcher, exits, and waits for you to start `dsh` again |
| Install and restart | Installs the launcher and restarts the same profile immediately |
| Remove plugin | Removes `dsh-harmony` from the current profile |
| Ignore once | Continues this boot without the Harmony runtime |

For WebUI, **Install and restart** reloads the page when the new process is ready. Interactive terminal profiles show the same choices as a numbered prompt.

The `harmony` service becomes available only after the restarted process has loaded the module hooks. This prevents a plugin with `inject = ['harmony']` from starting in an unpatched process.

## Desktop integration

When Desktop exposes a configurable Host entry, point it at the public `dsh-harmony/bin` export:

```text
Desktop supervisor
  -> dsh-harmony/bin
  -> @deepseek-ai/dsh/lib/bin.js web --host 127.0.0.1 --port 0
  -> readiness URL
  -> BrowserWindow
```

If Harmony and the built-in DSH live in separate Node dependency trees, set `DSH_HARMONY_DSH_ENTRY` to the built-in `@deepseek-ai/dsh/lib/bin.js` absolute path. Otherwise Harmony resolves the official CLI from its peer dependency.

Desktop continues to own the Node executable, child process, working directory, exit handling, and readiness protocol. This route does not use or modify the system-global `dsh` shim.

::: info Desktop support
Desktop starts its built-in official CLI directly. A global Harmony installation cannot affect it until Desktop provides the configurable Host entry described above.
:::

## Profiles

Harmony discovers providers and targets from the selected profile. `dsh harmony` uses `web` by default; name another profile when needed:

```sh
dsh harmony --profile tui
dsh harmony status --profile tui
dsh harmony inspect target-plugin --file lib/index.js --profile tui
```

Each profile stores its provider `order`, global `patchOrder`, and disabled Patch keys in `$DSH_HOME/profiles/<name>/harmony.json`.

## Updating

Update Harmony through npm:

```sh
npm install -g dsh-harmony@latest
```

If a later DSH installation takes ownership of the `dsh` command, start the affected profile normally. Harmony's bootstrap bundle restores the shim and WebUI displays a restart banner. **Restart now** closes the Loader Tree and starts the same command through Harmony.

Keep the official DSH version inside the peer dependency range declared by the installed Harmony release.

## Removing Harmony

Remove the profile bundle before the global runtime:

```sh
dsh plugin --profile web remove dsh-harmony
npm uninstall -g dsh-harmony
dsh web
```

Repeat the first command for every profile that contains the bundle. The shim delegates to the existing official CLI after Harmony is gone, and the bootstrap entry removes itself on a later official boot. Target files require no restoration.

If the global package was removed first, start each remaining profile and choose **Remove plugin** when prompted.
