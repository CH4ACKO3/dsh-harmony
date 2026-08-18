# Studio previews

Patch providers use the optional `dsh-harmony-react/studio` entry to describe Elements and editable variables to a compatible [dsh-webui-studio](https://github.com/CH4ACKO3/dsh-webui-studio) Draft.

Studio Preview injects the browser registry that receives these registrations. In a normal `dsh web` session, the same calls do nothing.

## Register an Element

Associate the Element with a `SurfaceHost` or `SurfaceBoundary` from `dsh-ui-container` by using the same `surfaceId` and path:

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
      children: [{
        kind: 'variable',
        id: 'accent',
        label: 'Accent',
        control: 'color',
        defaultSource: {
          file: 'src/SettingsCard.tsx',
          before: 'const accent = ',
          after: ';',
        },
      }],
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

Call the returned disposer from the client plugin or component lifecycle. Use `registerStudioVariables` for plugin-wide controls that do not belong to one Element.

## Variable trees and persisted defaults

The `variables` array is a tree of `group` and `variable` nodes. Groups may contain variables or nested groups. Node IDs and variable IDs must be unique within one registration. Only leaf variables have bindings, keyed by variable ID.

Use `defaultSource` when Studio should write a new default into the Draft for the next load. This does not replace the live binding. In the named Draft-relative file, `before` and `after` must surround one supported literal; Studio rejects missing, ambiguous, or non-literal matches.

## Registration contract

- Source paths are normalized, Draft-relative POSIX paths.
- Variable controls support color, length, number, boolean, enum, and string values.
- Bindings are the only live write surface: Studio serializes an update, calls `set`, then publishes the current `get()` value.
- `subscribe` is optional and returns its own disposer.

## Provider and Host APIs

Patch providers import definitions, bindings, registrations, `registerStudioElement`, and `registerStudioVariables` from `dsh-harmony-react/studio`.

A Studio implementation imports only the shared injection key and runtime registration contract from `dsh-harmony-react/studio-host`:

```ts
import { STUDIO_RUNTIME_KEY, type StudioBrowserRuntime } from 'dsh-harmony-react/studio-host'
```

Registry snapshots, selection state, preview messages, and persistence belong to the Studio application, not the provider API. Providers therefore do not depend on one Studio implementation.

## What a trace shows

A registered Element says that the Draft owns that subtree. React factories can attach the owner, declaration, target, and effect to likely render paths. Name-based Component Patches add `decorate-component` or `replace-component` traces to JSX calls that use the selected binding.

The trace does not identify the author of every node. Another provider may change an ancestor or its props, or add a node that has no direct source counterpart. A raw Component TSQuery has no inferred binding name and records no call path. Raw Source Patches without trace data appear only in Harmony's target inspection.
