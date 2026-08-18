# dsh-harmony-react

React-aware source patch factories for [dsh-harmony](https://github.com/memorax-ai/dsh-harmony).

This package is a Node-side Harmony extension, not a DSH client runtime. It turns
React Element and Component operations into ordinary `HarmonySourcePatch` declarations. Harmony
continues to own patch discovery, ordering, validation, transactions, and WebUI HMR.

## Architecture

A downstream package is the only DSH plugin involved. It carries:

- a Harmony patch provider;
- an immediately-prefetched client bundle exporting its React components;
- a minimal DSH entry so the package appears in the Loader Tree.

`dsh-harmony-react` itself is only a dependency of that provider and does not add a
second DSH plugin. Its optional `dsh-harmony-react/studio` browser API delegates to a
registry injected only inside a Studio Preview; the same registrations are no-ops in
normal `dsh web` sessions.

Studio hosts use the separate `dsh-harmony-react/studio-host` integration contract.
Patch providers should not import that host-only entry point.

## Example

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
    with: {
      module: 'my-harmony-plugin',
      export: 'CustomBrand',
    },
  },
})
```

The generated patch changes the component type in the existing JSX call while
preserving its props and key:

```js
(0, react_jsx_runtime.jsx)(
  require('my-harmony-plugin').CustomBrand,
  originalProps,
)
```

The downstream package must declare its browser bundle as immediately prefetched so
the synchronous `require()` inserted into another client module can resolve it:

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

## Element and Component patches

Use `element()` for one or more concrete compiled `jsx`/`jsxs` call sites. Its
operation can `replace`, `wrap`, `insert-before`, `insert-after`, `transform-props`,
or `remove` the selected Element. The change affects only the matched call sites.

Use `component()` to change a component binding declared by an initialized variable or
a named function declaration. `decorate` wraps the current definition in a browser-side
higher-order function; `replace` replaces that definition. Every call site that reads
the binding observes the result:

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

Component selectors must directly match a `VariableDeclaration` with an initializer or
a named `FunctionDeclaration` with a body. Function declarations are rewritten into an
initialized `const` binding so later Component Patches can wrap or replace the result in
resolved Patch order. As a consequence, a patched function component must not be read
before its declaration: unlike the original function declaration, the generated binding
is not hoisted. This tradeoff preserves definition-wide replacement and decoration for
every call site as well as composition between multiple Component Patches; Harmony does
not silently leave pre-declaration calls undecorated. Use a core Source Patch when that
hoisting restriction is incompatible with the target, or when a function body or another
declaration form must change.

Element selectors can address a local or member component name, an intrinsic tag, or
use raw TSQuery. A raw Element TSQuery must select the compiled `jsx`/`jsxs`
`CallExpression` itself. A raw Component TSQuery must select the initialized variable or
named function declaration itself. Every patch requires an exact `expect`, explicit
target version, and explicit target files. A single patch rejects nested matches when
their source edits overlap; use explicitly ordered patches when both parent and child
must change.

Harmony applies every React Patch to the source produced by earlier Patches. Compatible
decorators and prop transforms therefore compose in resolved Patch order. React does
not add a second ordering model; provider and Patch `before`/`after`, user order, and
`patchOrder` remain owned by Harmony.

Name-based Component selectors also emit Preview trace metadata for compiled JSX call
sites that reference the binding. A raw Component TSQuery still applies normally but
does not emit call-path trace metadata because an arbitrary AST selector does not
reliably identify the component binding name.

Client-side prop transformers are ordinary functions, not React components, and must
not call hooks. Use a wrapper or replacement component when hooks are required.

## Studio Elements

Studio shows only subtrees and variables that a Draft explicitly registers. Associate
the registration with a `SurfaceHost` or `SurfaceBoundary` from `dsh-ui-container` by
using the same `surfaceId` and path:

```ts
import { registerStudioElement } from 'dsh-harmony-react/studio'

let accent = '#245fd6'
const listeners = new Set<() => void>()

const dispose = registerStudioElement({
  owner: 'my-harmony-plugin',
  element: {
    id: 'settings-card',
    label: 'Settings card',
    boundary: { surfaceId: 'settings', path: ['appearance', 'card'] },
    source: { file: 'src/SettingsCard.tsx', line: 12 },
    variables: [{
      kind: 'group',
      id: 'appearance',
      label: 'Appearance',
      children: [
        { kind: 'variable', id: 'accent', label: 'Accent', control: 'color' },
      ],
    }],
  },
  bindings: {
    accent: {
      get: () => accent,
      set(value) {
        accent = String(value)
        for (const listener of listeners) listener()
      },
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
  },
})
```

Call the returned disposer with the client plugin or component lifecycle. Use
`registerStudioVariables` for plugin-wide controls that do not belong to one Element.
Source paths must be normalized, Draft-relative POSIX paths. Variable bindings are the
only live write surface: Studio serializes updates, calls `set`, then publishes the
binding's current `get()` value in the next registry snapshot.

The `variables` array is a tree. A `group` node may contain variable nodes or more
groups, so one plugin can expose the same hierarchy it uses in source. Node IDs and
variable IDs must be unique within one registration; bindings exist only for
`variable` nodes and remain keyed by their variable ID.

To let Studio persist a control value, add a `defaultSource` anchor to its variable definition.
The `before` and `after` strings must surround exactly one source literal in the Draft
file. Studio replaces only the text between those anchors and refuses ambiguous or
non-literal matches. This changes the next-load default; the runtime binding remains
reactive and is not replaced:

```ts
{
  kind: 'variable',
  id: 'accent',
  label: 'Accent',
  control: 'color',
  defaultSource: {
    file: 'src/SettingsCard.tsx',
    before: 'const accent = ',
    after: ';',
  },
}
```

An Element boundary proves only that the Draft owns the registered subtree contract.
Preview trace wrappers produced by the factories can add candidate Patch metadata for
the selected React render path, including owner, declaration, target, and effect. The
metadata is not exact node authorship: another plugin may patch an ancestor, transform
props, or contribute a node that has no direct counterpart in the registered Element
source. Raw Source Patches without trace intent remain visible only through target-level
Harmony inspection.
