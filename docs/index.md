---
layout: home

title: Harmony
description: Runtime Patch coordination for DeepSeek Harness plugins.

hero:
  name: Harmony
  text: Runtime Patches for DeepSeek Harness plugins.
  tagline: A library for patching, replacing and decorating DeepSeek Harness plugins during runtime.
  image:
    src: /harmony-icon.png
    alt: Harmony interlocking rings
  actions:
    - theme: brand
      text: Install Harmony
      link: /guide/installation
    - theme: alt
      text: Write a Patch
      link: /patches/authoring

features:
  - title: Source Patches
    details: Match compiled TypeScript AST nodes with TSQuery, then rewrite exact in-memory ranges with MagicString.
    link: /patches/authoring#source-patch
    linkText: Author a Source Patch
  - title: Semantic Patches
    details: Decorate named Host functions with before, after, around, or replace handlers while preserving the call chain.
    link: /patches/authoring#semantic-patch
    linkText: Author a Semantic Patch
  - title: React-aware Patches
    details: Patch one compiled jsx or jsxs call with element(), or decorate and replace every use of a definition with component().
    link: /integrations/react
    linkText: Explore React integration
  - title: Runtime control
    details: Interleave individual Patches across providers, drag whole provider stacks, inspect transformations, undo edits, and save transactionally.
    link: /guide/operations
    linkText: Operate Harmony
---

## Patch the runtime, not the installation

Harmony resolves one deterministic global Patch order. Each Source Patch receives the previous Patch's output, so independent modifications can compose against the same target. Composite Patches share one position, enablement state, and atomic success boundary. A Patch that cannot be applied is reported and skipped; installed plugin files are never rewritten.

```text
installed source (unchanged)
  -> global Patch order
  -> validated in-memory transformations
  -> Host reload or browser HMR
```

Start with [how Harmony fits into the runtime](/guide/introduction), or go directly to the [installation guide](/guide/installation). Inspired by Andreas Pardeike and contributors' C# project [Harmony](https://harmony.pardeike.net/).
