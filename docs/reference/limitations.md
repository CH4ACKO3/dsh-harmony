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

## TypeScript loading

A `typescript` Loader Patch transpiles syntax without type-checking and does not load the target package's `tsconfig.json`. Runtime imports must still follow Node's resolution rules; Harmony does not add TypeScript path aliases or infer missing extensions. Loading is limited to TypeScript files inside the declared target package and version.

## Semantic targets

Semantic Patches support named function declarations and class methods. Parameters must be named identifiers; generators are not supported.

Semantic handlers execute in Node.js. Browser bundles such as `lib/client.js` require Source Patches.

Only the first enabled semantic `replace` Patch in global Patch order may target a function. Later replacements are marked `failed` and skipped.

## Provider order

`before` and `after` are relationships over provider package names, not numeric priorities. Contradictory constraints may have no perfect order; automatic sorting minimizes violations but does not override the manual provider or Patch list.

`conflicts` produces a warning, not an installation or runtime block.

## React Component declarations

`component()` supports initialized variables and named function declarations. To keep later Component Patches composable, a function declaration is rewritten to an initialized `const` binding. It is no longer hoisted. Use a core Source Patch if the component is referenced before its declaration.

A raw Component TSQuery cannot reliably identify the binding referenced by JSX call sites, so it does not produce Component call-path trace metadata. Use `{ name }` when Studio trace is required.

## Runtime ownership

Harmony does not:

- mutate installed target files;
- proxy WebUI traffic;
- provide a second Host or session store;
- make a global installation affect an upstream Desktop that starts its own built-in CLI directly;
- infer whether two arbitrary source transformations are semantically compatible.
