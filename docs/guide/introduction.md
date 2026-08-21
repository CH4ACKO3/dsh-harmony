# What is Harmony?

**dsh-harmony changes DeepSeek Harness plugins at runtime.** Use the official plugin API to add a service, tool, Slot, or page. Use Harmony when a plugin must change behavior that has no extension point.

A provider can rewrite another plugin before it loads, replace a named function, or decorate its calls. The transformed source exists only in memory. Harmony never rewrites the installed package on disk.

## Choose an extension method

| Approach | Best for | Tradeoff |
| --- | --- | --- |
| Official plugin API | Registering exposed services, Slots, tools, and pages | Cannot alter internals without an extension point |
| Maintaining a fork | Unrestricted source changes | Must continuously merge upstream; multiple forks cannot coordinate |
| **dsh-harmony** | Runtime changes to Host and WebUI plugins | Patches must follow changes in the target's compiled structure |

Harmony keeps the existing `dsh` commands, plugin loader, and plugin composition. Before the Loader executes a plugin, Harmony collects its Patches, puts them in order, and applies them. The design is inspired by [Harmony for C# and .NET](https://github.com/pardeike/Harmony).

## Runtime path

The global command runs through:

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

## What Harmony handles

- **Source Patches** transform `lib/index.js`, `lib/client.js`, or another compiled target through the TypeScript AST.
- **Semantic Patches** apply `before`, `after`, `around`, or `replace` to named functions and class methods.
- **Loader Patches** transpile an explicitly targeted package's published TypeScript before Node's default loader runs.
- **Global Patch order** starts from provider declarations, lets individual Patches override those relations, and accepts an exact user-controlled cross-provider permutation.
- **Composite Patches** group ordinary Patches into one ordered, toggleable transaction across all resolved files.
- **Transactions** preflight provider changes, order changes, and enablement before committing a reload.
- **Inspection** exposes original source, each intermediate Patch result, and final runtime source.
- **Tooling APIs** let plugins and local tools read, preflight, inspect, and transactionally update a profile.

Harmony has no numeric priority. A provider only declares the ordering relationships it knows, and the user can resolve anything left over by moving a provider or a single Patch. For execution, Harmony takes the Patches that affect each file from the global list. Unrelated files can run in parallel. A Patch that touches several files waits until it is next for all of them, so every result still follows the saved order.

## Host and browser targets

Node targets reload through the Loader Tree. Relative ESM imports inside the same target package inherit one Patch generation; CommonJS reloads invalidate that package's internal `require` graph.

Browser targets such as `lib/client.js` use Harness's existing `clientModules.rebuilt` event. Harmony updates the bundle revision and sends the normal HMR event, so WebUI reloads only the client plugin that changed. It also moves provider-owned style tags to match the enabled Patch order.

## Failures and rollback

Before an update is committed, Harmony tries the saved Patch order against every affected target. A Patch that cannot match or apply is reported and skipped, while the Host keeps running. If a provider declaration cannot load or a target cannot reload, Harmony keeps the previous Loader Tree and profile settings. Uninstalling Harmony needs no file repair because target packages were never changed.

Next: [install the runtime](/guide/installation) or [write a Patch](/patches/authoring).
