---
layout: home

hero:
  name: dsh-harmony
  text: Change plugins without changing their files.
  tagline: Runtime Patch coordination for DeepSeek Harness, with deterministic order, transactional reloads, and an inspectable source trail.
  image:
    src: /harmony-icon.png
    alt: Harmony interlocked loop mark
  actions:
    - theme: brand
      text: Install Harmony
      link: /guide/installation
    - theme: alt
      text: Write your first Patch
      link: /patches/authoring
---

<HomeFlow />

<section class="home-follow">
  <div>
    <h2>One order, everywhere.</h2>
    <p>The Web Settings page and terminal UI operate on the same profile state. Reorder providers, inspect conflicts, disable one Patch, and hot-reload only the affected targets.</p>
    <p><a href="/guide/operations">Learn how ordering and reloads work →</a></p>
  </div>
  <img src="/harmony-preview-light.png" alt="Harmony plugin order and Patch status pages in DeepSeek Harness Settings">
</section>

<section class="home-start">
  <h2>Start from the path you need.</h2>
  <div class="home-start__links">
    <a href="/guide/introduction"><strong>Understand the runtime</strong><span>Where Harmony sits relative to the Loader, Host, and WebUI.</span></a>
    <a href="/patches/authoring"><strong>Patch a compiled module</strong><span>Source selectors, semantic handlers, ordering, and conflicts.</span></a>
    <a href="/integrations/react"><strong>Change a React tree</strong><span>Typed factories for compiled jsx and jsxs calls.</span></a>
    <a href="/help/troubleshooting"><strong>Recover a broken Patch</strong><span>Status codes, source inspection, and common first-boot issues.</span></a>
  </div>
</section>
