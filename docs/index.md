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
    details: Find nodes in compiled TypeScript with TSQuery and rewrite their in-memory source ranges with MagicString.
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
    details: Move whole providers or individual Patches, inspect each change, undo edits, and reload without touching installed files.
    link: /guide/operations
    linkText: Operate Harmony
---

## Patch the runtime, not the installation

Harmony runs Source Patches in one global order, and each Patch reads the source left by the previous one. A composite Patch gives several changes one position and one switch, and applies them only when every member succeeds. Failed standalone Patches are reported and skipped. Installed files remain unchanged.

```text
installed source (unchanged)
  -> global Patch order
  -> in-memory changes
  -> Host reload or browser HMR
```

Read [how Harmony fits into the runtime](/guide/introduction), then follow the [installation guide](/guide/installation). The project is inspired by Andreas Pardeike and contributors' C# project [Harmony](https://harmony.pardeike.net/).

<EcosystemShowcase
  mode="compact"
  locale="en"
  :limit="5"
  heading="Plugin ecosystem"
  intro="Harmony helps these plugins bring their great ideas to life."
  refresh-label="Show me more"
/>

[Explore the ecosystem](/ecosystem) · [Submit a project](https://github.com/memorax-ai/dsh-harmony/edit/docs/docs/.vitepress/ecosystem.ts)

## Powered by Harmony

If your plugin uses Harmony, you’re welcome to use this badge to show your support!

[![Powered by Harmony](/harmony-powered.svg)](https://memorax-ai.github.io/dsh-harmony/)

```md
[![Powered by Harmony](https://memorax-ai.github.io/dsh-harmony/harmony-powered.svg)](https://memorax-ai.github.io/dsh-harmony/)
```
