# Patch authoring

A Patch provider is an ordinary DSH plugin that declares one or more CommonJS modules. Harmony discovers those modules from the selected Loader profile before target plugins execute.

## Provider declaration

Add Harmony metadata to the provider's `package.json`:

```json
{
  "name": "my-dsh-plugin",
  "dsh": {
    "harmony": {
      "patches": ["./patches/answer.patch.cjs"],
      "after": ["base-patches"],
      "before": ["ui-patches"],
      "conflicts": ["legacy-patches"]
    }
  }
}
```

Patch files must be CommonJS modules. A module may export one Patch declaration or an array of declarations. Harmony collects them synchronously during live Loader updates.

If the provider itself cannot run without Harmony, use the existing DSH dependency mechanism:

```ts
export const inject = ['harmony']
```

Or add the service to its Loader row:

```yaml
- id: my-plugin
  inject: [harmony]
```

## Source Patch

Source Patches select TypeScript AST nodes and edit the current source through MagicString:

```js
/** @type {import('dsh-harmony').HarmonyPatch} */
module.exports = {
  id: 'answer-value',
  target: {
    package: 'some-dsh-plugin',
    version: '^1.2.0',
    files: ['lib/index.js'],
  },
  select: 'FunctionDeclaration[name.name="answer"] NumericLiteral',
  expect: 1,
  after: ['base-patches'],
  apply({ node, sourceFile, edit }) {
    edit.overwrite(node.getStart(sourceFile), node.getEnd(), '42')
  },
}
```

`select` uses [TSQuery](https://github.com/phenomnomnominal/tsquery). The callback receives:

| Field | Value |
| --- | --- |
| `patch` | Stable key and provider owner |
| `source` | Source produced by all earlier Patches |
| `sourceFile` | Parsed TypeScript AST |
| `node` | Current selector match |
| `edit` | [MagicString](https://github.com/Rich-Harris/magic-string) editor for the current source |
| `ts` | TypeScript namespace |

Positions passed to `edit` refer to the source received by this Patch. `files` contains alternative package-relative targets; Harmony selects the first existing file. `version` is a semver range, and `expect` requires an exact match count.

Every Source Patch parses and selects the source produced by earlier Patches. Harmony does not query every Patch against one original AST and then apply all edits later; that would make selectors observe stale structure and create ambiguous ranges.

## Loader Patch

Use a Loader Patch when a target package publishes TypeScript instead of JavaScript that Node can execute from `node_modules`:

```js
/** @type {import('dsh-harmony').HarmonyPatch} */
module.exports = {
  id: 'load-published-typescript',
  target: {
    package: 'typescript-only-plugin',
    version: '^1.0.0',
    files: ['index.ts'],
  },
  loader: 'typescript',
}
```

The target file is the compatibility anchor used for binding and status. Once bound, Harmony reads and transpiles `.ts`, `.tsx`, `.mts`, and `.cts` modules inside that exact package before Node's default loader runs. Other packages retain Node's default behavior.

Declare Source Patches separately when the TypeScript also needs modification. Exact-file Source Patches run before the current module is transpiled, while the Loader Patch covers its package-local TypeScript imports.

## Semantic Patch

Named function declarations and class methods can be decorated without writing AST edits:

```js
module.exports = {
  id: 'answer-after',
  target: {
    package: 'some-dsh-plugin',
    version: '^1.2.0',
    files: ['lib/index.js'],
    function: 'answer',
  },
  operation: 'after',
  handler({ result }) {
    return result + 1
  },
}
```

| Operation | Behavior |
| --- | --- |
| `before` | Runs before the target and may return a replacement argument array |
| `after` | Runs after the target and may replace a synchronous or asynchronous result |
| `around` | Receives `invoke(args?)` and controls whether and how the next layer runs |
| `replace` | Replaces the target through `invoke(args?)`; only one enabled replacement may own a function |

All `before` handlers run in Patch order. `around` and `replace` form an outer-to-inner chain in Patch order. All `after` handlers then run in Patch order. Source and semantic Patches share the same global Patch order.

Semantic targets currently require named parameters and do not support generators. Handlers run in Node.js, so browser targets such as `lib/client.js` must use source Patches.

## Composite Patch

Use a composite when several ordinary Patches must share ordering, enablement, and success or failure:

```js
module.exports = {
  id: 'feature-set',
  after: ['base-patches'],
  patches: [
    {
      id: 'host-part',
      target: { package: 'target-plugin', version: '^1.0.0', files: ['lib/index.js'] },
      select: 'StringLiteral[text="old"]',
      expect: 1,
      apply({ node, sourceFile, edit }) {
        edit.overwrite(node.getStart(sourceFile), node.getEnd(), JSON.stringify('new'))
      },
    },
    {
      id: 'client-part',
      target: { package: 'target-plugin', version: '^1.0.0', files: ['lib/client.js'] },
      select: 'StringLiteral[text="old"]',
      expect: 1,
      apply({ node, sourceFile, edit }) {
        edit.overwrite(node.getStart(sourceFile), node.getEnd(), JSON.stringify('new'))
      },
    },
  ],
}
```

The composite has one stable key, one position in `patchOrder`, and one enablement state. Members keep declaration order. Harmony preflights every resolved member target; if one member cannot bind or apply, none of the composite's members commit. A composite is a transaction boundary, not a request to batch all queries against original source.

## Ordering constraints

`before` and `after` refer to provider package names. They are sorting constraints, not npm or Cordis dependencies.

- Provider-level rules in `package.json` are the default for every owned Patch.
- Defining `before` or `after` on one Patch replaces the provider-wide rules for that Patch; it does not append to them.
- The resolved global `patchOrder` may interleave Patches from different providers.
- With no user override, declaration order remains the stable tie-breaker.

The user order is authoritative. Automatic sorting finds a minimum-violation order while preserving existing order when solutions tie; contradictory rules remain visible as warnings rather than inventing numeric priority.

Changing the provider order regroups owned Patches. Changing `patchOrder` directly preserves the exact cross-provider permutation. Every later Source Patch receives the output of the earlier one.

## Provider conflicts

`conflicts` declares provider incompatibilities. A one-sided declaration is enough. Harmony shows the warning only when both packages are enabled Patch providers in the current Loader Tree.

The warning does not block installation, startup, application, ordering, or reload. Disabling either provider with `<provider>/*` removes it.

## Minimal WebUI example

The following Patch replaces the new-session headline in the compiled conversation client:

```js
const headline = 'Harmony is All You Need'

module.exports = {
  id: 'home-banner',
  target: {
    package: '@deepseek-ai/dsh-client-ui-conversation',
    version: '0.1.0-rc.6',
    files: ['lib/client.js'],
  },
  select: 'StringLiteral[text="探索未至之境"]',
  expect: 1,
  apply({ node, sourceFile, edit }) {
    edit.overwrite(node.getStart(sourceFile), node.getEnd(), JSON.stringify(headline))
  },
}
```

![WebUI new-session hero changed by a Harmony Patch](/webui-banner-example.jpg)

## Service and tooling APIs

Plugins can inject the `harmony` service:

```ts
export const inject = ['harmony']

export function apply(ctx) {
  const snapshot = ctx.harmony.inspect({ package: 'some-dsh-plugin' })
}
```

The service exposes:

- `binEntry` and `profileDir` for the active runtime;
- `inspect(input?)` for Patch status and transformed target snapshots;
- `inspectDependencies(owner)` for relationships inferred between Patches;
- `reloadPlugin(name)` for transactionally reloading one Loader plugin and its Patch declarations.

The package also exports extension discovery helpers and their TypeScript types for downstream tooling. Preview and Draft lifecycle APIs belong to WebUI Studio rather than Harmony.
