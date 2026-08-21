# React patches

`dsh-harmony-react` turns React-specific requests into ordinary `HarmonySourcePatch` declarations. It recognizes compiled `jsx` and `jsxs` calls; Harmony then discovers, orders, applies, inspects, and reloads those Patches like any other Source Patch.

```sh
npm install dsh-harmony-react
```

The package runs on the Node side. It is neither a DSH plugin nor a browser runtime; the Patch provider is the only plugin you install.

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

Immediate prefetching makes the provider's browser export available to the synchronous `require()` that Harmony inserts into the target client module.

## Element: change selected call sites

Use `element()` when a change should apply only at selected render locations:

```js
const { element } = require('dsh-harmony-react')

module.exports = element({
  id: 'custom-sidebar-brand',
  target: {
    package: '@deepseek-ai/dsh-client-ui-sidebar',
    version: '0.1.0-rc.8',
    file: 'lib/client.js',
  },
  select: { component: 'BrandWordmark' },
  expect: 1,
  operation: {
    kind: 'replace',
    with: { module: 'my-harmony-plugin', export: 'CustomBrand' },
  },
})
```

This Patch changes the component type and keeps the existing props and key. `element()` supports:

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
    version: '0.1.0-rc.8',
    file: 'lib/client.js',
  },
  select: { name: 'Button' },
  expect: 1,
  operation: {
    kind: 'decorate',
    with: { module: 'my-harmony-plugin', export: 'withFeature' },
  },
})
```

`decorate` passes the current definition through a browser-side higher-order function. `replace` assigns the supplied export instead. A name selector can match:

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

React Patches read the source left by earlier Patches and use the same global `patchOrder`. Put parent and child edits in separate Patches with a declared order: one Patch rejects edits whose source ranges overlap.

## Inspect trace

Element factories record Preview traces for supported operations. A name-based Component selector also marks compiled JSX calls that use the binding with `decorate-component` or `replace-component`.

A raw Component TSQuery still works, but Harmony cannot infer a binding name from an arbitrary AST selector, so it records no call-path trace. A trace points to a likely render path; it does not prove which Patch created every node. Use `dsh harmony inspect` to see the transformed target source.

See the [runnable rebrand example](https://github.com/memorax-ai/dsh-harmony/tree/main/packages/react/examples/rebrand-plugin) for a complete provider and browser bundle.
