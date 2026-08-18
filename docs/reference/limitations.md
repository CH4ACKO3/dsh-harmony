# Limitations

Harmony changes compiled code at runtime. The limits below describe what it cannot restore, infer, or patch safely.

## Patch modules

Provider Patch files must be CommonJS modules. Harmony's live Loader update path collects them synchronously.

If a Source Patch's `apply()` throws, Harmony discards its in-memory edits and continues from the previous source. It cannot undo file writes, network calls, global mutations, or other work performed by the Patch itself. Keep declarations and `apply()` deterministic and free of side effects.

## Loader rollback

Harmony evaluates a replacement plugin module before swapping its Loader Fiber. If evaluation or startup fails, it restores the previous Fiber and CommonJS cache. Module-level side effects cannot be undone. ESM reloads use a new generation URL each time, so Node.js keeps those module instances until the Host exits.

Plugins intended for live reload should not create timers or listeners, write files, or mutate global singletons at module scope. Register those effects inside the Cordis plugin lifecycle so Loader disposal owns their cleanup. Restart the Host after an extended session of high-frequency ESM reloads.

## Compiled structure

Source selectors depend on the target's compiled shape. An upgrade can change names, nesting, JSX output, or bundler helpers even when the visible feature looks the same. Pin `target.version`, set an exact `expect`, and run `dsh harmony status` before release.

## TypeScript loading

A `typescript` Loader Patch transpiles syntax but does not type-check or read the target's `tsconfig.json`. Imports must still follow Node's resolution rules. Harmony adds no TypeScript path aliases and does not infer missing extensions. It only loads TypeScript from the declared package and version.

## Semantic targets

Semantic Patches support named function declarations and class methods. Parameters must be named identifiers; generators are not supported.

Semantic handlers execute in Node.js. Browser bundles such as `lib/client.js` require Source Patches.

Only the first enabled semantic `replace` Patch in global Patch order may target a function. Later replacements are marked `failed` and skipped.

## Provider order

`before` and `after` are relationships over provider package names, not numeric priorities. Contradictory constraints may have no perfect order; automatic sorting minimizes violations but does not override the manual provider or Patch list.

`conflicts` produces a warning, not an installation or runtime block.

## React Component declarations

`component()` accepts initialized variables and named function declarations. Harmony rewrites a function declaration as an initialized `const` so later Component Patches can change the same binding. That binding is not hoisted. If the component is read before its declaration, use a core Source Patch.

A raw Component TSQuery does not tell Harmony which binding the JSX calls use, so it produces no Component call-path trace. Use `{ name }` when Studio needs that trace.

## Runtime ownership

Harmony does not:

- mutate installed target files;
- proxy WebUI traffic;
- provide a second Host or session store;
- make a global installation affect an upstream Desktop that starts its own built-in CLI directly;
- infer whether two arbitrary source transformations are semantically compatible.
