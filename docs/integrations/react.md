# React patches

`dsh-harmony-react` turns component-level operations into ordinary `HarmonySourcePatch` declarations for compiled React `jsx` and `jsxs` calls.

```sh
npm install dsh-harmony-react
```

It is a Node-side helper, not another DSH plugin or client runtime. Your downstream provider remains the only plugin involved; Harmony still owns discovery, order, validation, transactions, and WebUI HMR.

## Package shape

A downstream plugin normally carries:

- a Harmony Patch provider;
- an immediately-prefetched browser bundle exporting replacement components;
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

Immediate prefetching lets a synchronous `require()` inserted into another client module resolve your browser export.

## Replace an element

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

The generated Patch changes the component type while preserving the existing props and key:

```js
(0, react_jsx_runtime.jsx)(
  require('my-harmony-plugin').CustomBrand,
  originalProps,
)
```

## Operations

| Factory | Result |
| --- | --- |
| `replaceElement` | Replace the component type and preserve props and key |
| `wrapElement` | Wrap the existing element and pass it as `children` |
| `insertBefore` / `insertAfter` | Insert a sibling component |
| `transformProps` | Pass existing props through a browser-side function |
| `removeElement` | Replace the element with `null` |
| `replaceStringLiteral` | Replace an exact browser string literal |

Selectors can address a local component, member component, intrinsic tag, or raw TSQuery. Raw TSQuery must select the compiled `jsx` or `jsxs` `CallExpression`; selecting a descendant makes `expect` count syntax nodes instead of React elements.

Every factory requires an explicit target version and exact `expect` count. One Patch rejects nested matches if their edits overlap; use explicitly ordered Patches when both parent and child must change.

Client prop transformers are ordinary functions and must not call Hooks. Use a wrapper or replacement component when Hooks are required.

See the [runnable rebrand example](https://github.com/CH4ACKO3/dsh-harmony/tree/main/packages/react/examples/rebrand-plugin) for a complete provider and client bundle.
