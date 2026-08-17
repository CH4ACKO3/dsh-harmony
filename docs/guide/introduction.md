# What is Harmony?

**dsh-harmony is the runtime Patch coordination layer for DeepSeek Harness.** The official plugin API adds new capabilities; Harmony changes capabilities that already exist.

A provider can rewrite another plugin before it loads, replace a named function, or decorate its calls. The transformed source exists only in memory. Harmony never rewrites the installed package on disk.

## Choose the right extension path

| Approach | Best for | Boundary and cost |
| --- | --- | --- |
| Official plugin API | Registering exposed services, Slots, tools, and pages | Cannot alter internals without an extension point |
| Maintaining a fork | Unrestricted source changes | Must continuously merge upstream; multiple forks cannot coordinate |
| **dsh-harmony** | Runtime changes to Host and WebUI plugins | Patches must follow changes in the target's compiled structure |

Harmony is not another installer and does not replace the Harness Loader. It keeps the existing `dsh` commands and official plugin composition, then collects, orders, and applies Patches before the Loader executes a plugin. The design is inspired by [Harmony for C# and .NET](https://github.com/pardeike/Harmony).

## Runtime path

The global command follows one path:

```text
system dsh command
  -> Harmony shim
  -> dsh-harmony/bin
  -> @deepseek-ai/dsh/lib/bin.js
  -> Loader + Host
  -> same-origin WebUI + /api + WebSocket
```

Harmony installs its CommonJS and ESM transform hooks, then forwards the original CLI arguments. It does not proxy WebUI traffic, create a second Host, or store another backend URL.

| Component | Owns | Does not own |
| --- | --- | --- |
| Harmony | Runtime hooks, Patch discovery, ordering, validation, inspection, and reload transactions | A second backend or WebUI proxy |
| DSH Host | WebUI assets, `/api` HTTP RPC, and WebSockets | Sessions from another Host |
| WebUI | Same-origin connections to the active Host | A separately selectable backend URL |
| Desktop | One local Host process and its readiness URL | A rewritten Harness protocol |

## What Harmony coordinates

- **Source Patches** transform `lib/index.js`, `lib/client.js`, or another compiled target through the TypeScript AST.
- **Semantic Patches** apply `before`, `after`, `around`, or `replace` to named functions and class methods.
- **Loader Patches** transpile an explicitly targeted package's published TypeScript before Node's default loader runs.
- **Global order** combines manual provider order with declared `before` and `after` constraints.
- **Transactions** preflight provider changes, order changes, and enablement before committing a reload.
- **Inspection** exposes original source, each intermediate Patch result, and final runtime source.
- **Tooling APIs** let plugins and build tools query status or transactionally reload a plugin and its Patch declarations.

## Host and browser targets

Node targets reload through the Loader Tree. Relative ESM imports inside the same target package inherit one Patch generation; CommonJS reloads invalidate that package's internal `require` graph.

Browser targets such as `lib/client.js` use Harness's existing `clientModules.rebuilt` path. Harmony recalculates the transformed bundle revision and sends the normal HMR event, so an open WebUI reloads only the affected client plugin.

## Safety boundary

Every update evaluates the complete ordered Patch set for its affected targets. A Patch that cannot match or apply is skipped and reported without taking down the Host. Provider declaration failures and target reload failures keep the previous Loader Tree and profile state. Uninstalling Harmony returns execution to the original files because no target package needs restoration.

Next: [install the runtime](/guide/installation) or [write a Patch](/patches/authoring).
