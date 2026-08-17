---
name: use-dsh-harmony
description: Install and operate dsh-harmony, choose between Source, Semantic, React-aware, and Studio Patches, author Patch provider plugins, inspect transformed runtime source, control order and enablement, and troubleshoot failed or incompatible Patches. Use when an agent is asked to install Harmony, modify DeepSeek Harness Host or WebUI plugins without forks, create, review, or debug Harmony providers, integrate dsh-harmony-react or Studio previews, or diagnose Harmony status, ordering, reload, version, selector, or profile issues.
---

# Use dsh-harmony

Modify compiled DeepSeek Harness plugins at runtime through a separate Patch provider. Never edit or replace the installed target package.

## Decide first

Identify the active profile, target package, installed version, compiled target file, runtime side, and intended behavior before writing a Patch.

| Need | Choose |
| --- | --- |
| Patch a browser bundle such as `lib/client.js` | Source Patch |
| Match syntax, literals, imports, or arbitrary compiled structure | Source Patch |
| Decorate a named Node.js function or class method | Semantic Patch |
| Replace, wrap, insert, remove, or transform compiled React elements | A `dsh-harmony-react` factory, which produces a Source Patch |
| Expose explicit preview elements or editable variables to dsh-webui-studio | `dsh-harmony-react/studio` |

Use a Source Patch for every browser target. Semantic handlers execute in Node.js and do not support browser bundles, generators, or non-identifier parameters.

## Install Harmony

Require Node.js `^22.22.3` or `>=24.11.1` and `@deepseek-ai/dsh@0.1.0-rc.6` for the current release.

```sh
node --version
npm install -g @deepseek-ai/dsh@0.1.0-rc.6
npm install -g dsh-harmony
dsh web
```

Verify the selected profile:

```sh
dsh harmony status
dsh harmony status --profile tui
```

Alternatively, install `dsh-harmony` through `dsh plugin --profile web add dsh-harmony`, then choose **Install and restart** on first boot. Use **Settings -> Harmony** in WebUI or `dsh harmony --profile <name>` in the terminal.

When working from a repository checkout, read its `package.json` first and follow its declared `engines` and `peerDependencies`; they supersede versions shown here.

## Author a provider

Create an ordinary DSH plugin. Declare CommonJS Patch modules under `dsh.harmony` in `package.json`:

```json
{
  "name": "my-harmony-provider",
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

Treat `before` and `after` as provider package ordering constraints, not dependencies. Declare `conflicts` only for combinations known to be incompatible; it warns but does not block execution. Add `inject = ['harmony']` only when the provider plugin itself requires the Harmony service.

### Source Patch

Inspect the installed target's compiled file. Select the narrowest stable TypeScript AST shape with TSQuery and edit the current in-memory source through MagicString:

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
  apply({ node, sourceFile, edit }) {
    edit.overwrite(node.getStart(sourceFile), node.getEnd(), '42')
  },
}
```

Always set a target version and an exact `expect` count. Positions passed to `edit` refer to the source produced by all earlier Patches. Keep edits local and non-overlapping; do not write target files.

### Semantic Patch

Use a semantic operation only for a named Node.js function declaration or class method:

```js
/** @type {import('dsh-harmony').HarmonyPatch} */
module.exports = {
  id: 'answer-after',
  target: {
    package: 'some-dsh-plugin',
    version: '^1.2.0',
    files: ['lib/index.js'],
    function: 'answer',
  },
  operation: 'after',
  expect: 1,
  handler({ result }) {
    return result + 1
  },
}
```

Choose the operation deliberately:

- `before`: optionally replace the argument array.
- `after`: optionally replace the sync or async result.
- `around`: call or skip `invoke(args?)` around the next layer.
- `replace`: own the function through `invoke(args?)`; only one enabled replacement may target it.

## Install and validate a provider

Install the provider into the same profile as its targets, then validate the runtime result:

```sh
dsh plugin --profile web add ./my-harmony-provider
dsh harmony status --profile web
dsh harmony inspect some-dsh-plugin --file lib/index.js --profile web
```

Require all intended Patches to reach `bound`. Treat `status` exit code `1` as failure. Use `inspect` to compare the original source, every ordered intermediate result, and the final source. Confirm hot reload or restart behavior through the target feature.

Use Settings or `dsh harmony` to reorder and enable or disable Patches. Do not edit `$DSH_HOME/profiles/<name>/harmony.json` while the profile is running; UI and CLI changes are preflighted and committed transactionally.

## Diagnose failures

Check these in order:

1. Confirm the selected profile contains both the provider and target.
2. Confirm `target.version` accepts the installed target version and `files` names a compiled file that exists.
3. Compare `expect` with the actual selector match count against the current compiled shape.
4. Inspect earlier Patch outputs; a prior Patch may have changed or removed the selected node.
5. Replace a browser Semantic Patch with a Source Patch.
6. Resolve duplicate semantic `replace` ownership, overlapping source edits, or violated provider order.
7. Treat `conflicts` as compatibility warnings and contradictory `before`/`after` constraints as ordering problems.

Harmony skips an individual Patch that cannot match or apply, marks it `failed`, and continues with later Patches. Treat the warning and `status` exit code `1` as work to fix even though the Host remains available. A provider declaration that cannot load or a target reload that cannot commit still rolls back the candidate generation. Never repair a failure by modifying the installed target package or weakening `expect` without verifying the new compiled structure.

## Completion check

- Keep Patch IDs stable and unique within the provider.
- Pin a compatible target version and compiled file.
- Require exact matches and inspect the final transformed source.
- Verify the intended behavior in the correct profile and runtime side.
- Confirm installed target files remain unchanged.

Use the current project documentation as the authority for details: [installation](https://ch4acko3.github.io/dsh-harmony/guide/installation), [Patch authoring](https://ch4acko3.github.io/dsh-harmony/patches/authoring), [operations](https://ch4acko3.github.io/dsh-harmony/guide/operations), [React integration](https://ch4acko3.github.io/dsh-harmony/integrations/react), [Studio integration](https://ch4acko3.github.io/dsh-harmony/integrations/studio), [CLI](https://ch4acko3.github.io/dsh-harmony/reference/cli), and [limitations](https://ch4acko3.github.io/dsh-harmony/reference/limitations).
