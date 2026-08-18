# dsh-harmony-react

React-aware source patch factories for [dsh-harmony](https://github.com/CH4ACKO3/dsh-harmony).

This package is a Node-side Harmony extension, not a DSH client runtime. It turns
component-level operations into ordinary `HarmonySourcePatch` declarations. Harmony
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

## Example

```js
const { replaceElement } = require('dsh-harmony-react')

module.exports = replaceElement({
  id: 'custom-sidebar-brand',
  target: {
    package: '@deepseek-ai/dsh-client-ui-sidebar',
    version: '0.1.0-rc.6',
  },
  select: { component: 'BrandWordmark' },
  expect: 1,
  with: {
    module: 'my-harmony-plugin',
    export: 'CustomBrand',
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

## Operations

- `replaceElement`: replace the component type and preserve existing props and key.
- `wrapElement`: wrap the existing element and pass it as `children`.
- `insertBefore` / `insertAfter`: insert a component next to the existing element.
- `transformProps`: pass the existing props through a browser-side function.
- `removeElement`: replace the element with `null`.
- `replaceStringLiteral`: replace an exact string literal anywhere in the target bundle.

Selectors can address a local or member component name, an intrinsic tag, or use raw
TSQuery. A raw TSQuery must select the compiled `jsx`/`jsxs` `CallExpression` itself;
selecting one of its descendants would make `expect` count syntax nodes instead of
React elements. Every patch requires an exact `expect` count and an explicit target
version. A single patch also rejects nested matches when their source edits overlap;
use explicitly ordered patches when both parent and child must be changed.

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
    variables: [{ id: 'accent', label: 'Accent', control: 'color' }],
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

To let Studio persist a control value, add a `defaultSource` anchor to its variable definition.
The `before` and `after` strings must surround exactly one source literal in the Draft
file. Studio replaces only the text between those anchors and refuses ambiguous or
non-literal matches. This changes the next-load default; the runtime binding remains
reactive and is not replaced:

```ts
{
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
