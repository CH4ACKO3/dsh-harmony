# React patches

`dsh-harmony-react` provides React-aware factories that return ordinary `HarmonySourcePatch` declarations. It understands compiled `jsx` and `jsxs` calls, but Harmony still owns discovery, ordering, validation, transactions, inspection, and browser HMR.

```sh
npm install dsh-harmony-react
```

It is a Node-side helper, not another DSH plugin or client runtime. The downstream Patch provider remains the only plugin involved.

## Package shape

A provider that inserts browser code normally carries:

- CommonJS Patch declarations;
- an immediately-prefetched browser bundle exporting replacement components or functions;
- a minimal DSH entry so the package appears in the Loader Tree.

```json
{
  "dsh": {
    "client": {
      "immediately": true,
      "platform": "web"
    },
    "harmony": {
      "patches": ["./patch.cjs"]
    }
  }
}
```

Immediate prefetching lets the synchronous `require()` inserted into another client module resolve the provider's browser export.

## Element: change selected call sites

Use `element()` when a change should apply only at selected render locations:

```js
const { element } = require('dsh-harmony-react')

module.exports = element({
  id: 'custom-sidebar-brand',
  target: {
    package: '@deepseek-ai/dsh-client-ui-sidebar',
    version: '0.1.0-rc.6',
    files: ['lib/client.js'],
  },
  select: { component: 'BrandWordmark' },
  expect: 1,
  operation: {
    kind: 'replace',
    with: { module: 'my-harmony-plugin', export: 'CustomBrand' },
  },
})
```

The generated Patch changes the component type while preserving the existing props and key. Element operations are:

| `operation.kind` | Result |
| --- | --- |
| `replace` | Replace the component type |
| `wrap` | Wrap the selected Element and pass it as `children` |
| `insert-before` / `insert-after` | Create a two-child Fragment around the selected Element |
| `transform-props` | Pass the current props through a browser-side function |
| `remove` | Replace the selected Element with `null` |

Client prop transformers are ordinary functions, not React components, and must not call Hooks. Use a wrapper or replacement component when Hooks are required.

## Component: change the shared definition

Use `component()` when every call through one component binding should observe the change:

```js
const { component } = require('dsh-harmony-react')

module.exports = component({
  id: 'decorate-button',
  target: {
    package: '@deepseek-ai/dsh-client-ui-buttons',
    version: '0.1.0-rc.6',
    files: ['lib/client.js'],
  },
  select: { name: 'Button' },
  expect: 1,
  operation: {
    kind: 'decorate',
    with: { module: 'my-harmony-plugin', export: 'withFeature' },
  },
})
```

`decorate` wraps the current definition in a browser-side higher-order function. `replace` replaces the definition with the supplied export. Name selectors accept:

- a `VariableDeclaration` with an initializer;
- a named `FunctionDeclaration` with a body.

::: warning Function declaration hoisting
Harmony rewrites a matched function declaration to an initialized `const` so later Component Patches can decorate or replace the same binding in final Patch order. The generated binding is not hoisted. If the target reads the component before its declaration, use a core Source Patch instead. Harmony does not leave those early calls silently undecorated.
:::

Use a core Source Patch when the component body itself, a string literal, or another arbitrary syntax node must change.

## Selectors and composition

Element selectors accept a local or member component name, an intrinsic tag, or raw TSQuery. Raw Element TSQuery must select the compiled `jsx` / `jsxs` `CallExpression` itself.

Component selectors accept `{ name }` or raw TSQuery. Raw Component TSQuery must select the initialized variable declaration or named function declaration itself.

Every React Patch requires:

- an explicit target package, version, and file list;
- an exact `expect` count;
- a stable Patch `id`.

Harmony applies each React Patch to the source produced by earlier Patches. Compatible decorators, replacements, and prop transforms therefore compose in the final global `patchOrder`; React does not introduce a second ordering model. One Patch rejects overlapping nested edits, so parent and child changes should be separate, explicitly ordered Patches.

## Inspect trace

Element factories emit Preview trace metadata for supported operations. A name-based Component selector also emits `decorate-component` or `replace-component` candidate traces on compiled JSX call sites that reference the binding.

A raw Component TSQuery still applies, but it emits no call-path trace because an arbitrary AST selector cannot reliably identify the component binding name. Trace metadata indicates a candidate render path, not exact node authorship; target-level transformed source remains available through `dsh harmony inspect`.

See the [runnable rebrand example](https://github.com/memorax-ai/dsh-harmony/tree/main/packages/react/examples/rebrand-plugin) for a complete provider and browser bundle.
