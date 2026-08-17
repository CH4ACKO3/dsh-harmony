# Limitations

Harmony changes compiled runtime code, so its guarantees stop at explicit boundaries.

## Patch modules

Provider Patch files must be CommonJS modules. Harmony's live Loader update path collects them synchronously.

When a Source Patch's `apply()` throws, Harmony discards that Patch's in-memory edits and continues from the previous source. It cannot undo file writes, network calls, global mutations, or other side effects performed by Patch code. Keep Patch declarations and `apply()` functions deterministic and side-effect free.

## Loader rollback

Harmony evaluates a candidate plugin module before replacing its active Loader Fiber. If module evaluation or startup fails, Harmony restores the previous Fiber and CommonJS cache, but it cannot undo side effects that ran at module scope. Each ESM reload uses a distinct generation URL, so Node.js retains those module instances until the Host process exits.

Plugins intended for live reload should not create timers or listeners, write files, or mutate global singletons at module scope. Register those effects inside the Cordis plugin lifecycle so Loader disposal owns their cleanup. Restart the Host after an extended session of high-frequency ESM reloads.

## Compiled structure

Source selectors depend on the compiled shape of the target package. A target upgrade may change names, nesting, JSX output, or bundler helpers without changing the visible feature. Pin a compatible `target.version`, keep `expect` exact, and run `dsh harmony status` in release checks.

## Semantic targets

Semantic Patches support named function declarations and class methods. Parameters must be named identifiers; generators are not supported.

Semantic handlers execute in Node.js. Browser bundles such as `lib/client.js` require Source Patches.

Only the first enabled semantic `replace` Patch in provider order may target a function. Later replacements are marked `failed` and skipped.

## Provider order

`before` and `after` are preferences over provider package names. Contradictory constraints may have no perfect order; automatic sorting minimizes violations but does not override the manual list.

`conflicts` produces a warning, not an installation or runtime block.

## Runtime ownership

Harmony does not:

- mutate installed target files;
- proxy WebUI traffic;
- provide a second Host or session store;
- make a global installation affect an upstream Desktop that starts its own built-in CLI directly;
- infer whether two arbitrary source transformations are semantically compatible.
