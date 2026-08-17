---
name: dsh-harmony Documentation
description: A calm technical reference for runtime Patch coordination.
colors:
  cobalt: "#075ff7"
  cobalt-hover: "#0752d6"
  cobalt-deep: "#0c47b2"
  cool-paper: "#f9fbff"
  cool-paper-alt: "#f1f5fc"
  cool-surface: "#edf3fc"
  quiet-control: "#e6ecf4"
  surface-white: "#ffffff"
  ink: "#10233f"
  ink-secondary: "#40536d"
  ink-muted: "#63738a"
  code-navy: "#0b1f3a"
  halo-cobalt: "rgba(45, 102, 255, 0.11)"
  halo-cyan: "rgba(70, 178, 255, 0.065)"
typography:
  display:
    fontFamily: "Atkinson Hyperlegible Next Variable, sans-serif"
    fontSize: "clamp(2rem, 4vw, 2.625rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Atkinson Hyperlegible Next Variable, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Atkinson Hyperlegible Next Variable, sans-serif"
    fontSize: "17px"
    fontWeight: 460
    lineHeight: 1.72
  mono:
    fontFamily: "Source Code Pro Variable, monospace"
    fontSize: "0.82rem"
    fontWeight: 460
    lineHeight: 1.55
rounded:
  content: "8px"
  panel: "10px"
  action: "20px"
spacing:
  xs: "8px"
  sm: "18px"
  md: "24px"
  lg: "48px"
  xl: "72px"
components:
  button-brand:
    backgroundColor: "{colors.cobalt-deep}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.action}"
    padding: "0 20px"
    height: "40px"
  button-alt:
    backgroundColor: "{colors.quiet-control}"
    textColor: "{colors.ink}"
    rounded: "{rounded.action}"
    padding: "0 20px"
    height: "40px"
  capability-panel:
    backgroundColor: "{colors.cool-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "24px"
  code-block-light:
    backgroundColor: "{colors.cool-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    typography: "{typography.mono}"
  code-block-dark:
    backgroundColor: "{colors.code-navy}"
    textColor: "#d7e5f7"
    rounded: "{rounded.panel}"
    typography: "{typography.mono}"
---

# Design System: dsh-harmony Documentation

## Overview

**Creative North Star: "Layered Tracing Film"**

The documentation behaves like a precise service manual. The original plugin remains conceptually visible while each Patch adds a controlled, reversible layer. The result feels native to DeepSeek Harness: calm, exact, and built for sustained technical reading.

Ordinary pages let the standard documentation shell lead. The index is the controlled exception: a concise technical brand portal where readers identify Harmony, choose the Patch layer they need, and enter installation or authoring without crossing into a product-marketing page.

Expression comes from the interlocked Harmony mark, cool paper surfaces, solid cobalt actions, flat capability panels, and unusually clear typography. Decoration never competes with instructions, source examples, or runtime state.

**Key Characteristics:**

- Cool white paper with cobalt reserved for actions, links, and brand emphasis.
- Compact headings paired with highly legible long-form text.
- A restrained homepage brand block followed directly by four capability panels.
- Persistent navigation, page outline, tables, and copyable command blocks on ordinary documents.
- No promotional proof, decorative motion, or ornamental content systems.

## Colors

The palette is a cool technical neutral system with one solid cobalt action color and a tightly constrained cyan-tinted halo.

### Primary

- **Runtime Cobalt** (`#075ff7`): primary links, focus, and active brand emphasis.
- **Deep Cobalt** (`#0c47b2`): the solid primary action fill and stronger brand contrast.

### Secondary

- **Halo Cyan** (`rgba(70, 178, 255, 0.065)`): the lighter ellipse behind the homepage mark, never an independent accent.

### Neutral

- **Cool Paper** (`#f9fbff`): the default page background.
- **Cool Surface** (`#edf3fc`): capability panels, light code surfaces, and quiet grouped content.
- **Service Ink** (`#10233f`): primary text and headings.
- **Secondary Ink** (`#40536d`): descriptions and supporting copy.
- **Code Navy** (`#0b1f3a`): the dark-theme code surface.

**The One Accent Rule.** Cobalt marks actionable links, focus, and brand identity; neutral surfaces carry everything else.

## Typography

**Display and Body Font:** Atkinson Hyperlegible Next Variable, with a generic sans-serif fallback.

**Label/Mono Font:** Source Code Pro Variable, with a generic monospace fallback.

The pairing prioritizes character recognition and durable reading over fashionable neutrality. Display text is tightly tracked and compact; prose remains open, measured, and limited to roughly 72 characters per line.

### Hierarchy

- **Display** (700, `clamp(2rem, 4vw, 2.625rem)`, 1.08): document titles and the compact homepage brand statement.
- **Headline** (600, `1.5rem`, 1.3): document sections.
- **Body** (460, `17px`, 1.72): documentation prose and lists.
- **Mono** (`0.82rem`): paths, provider identifiers, runtime generations, and code.

**The Whole-Word Rule.** Technical nouns and key transformation terms must receive enough width to wrap between words, never inside them.

## Layout

Ordinary content uses VitePress's standard documentation shell: persistent sidebar on desktop, page outline where space permits, and a reading column capped near 72 characters. Major sections use a consistent 48px interval; tables fit the content width, and code blocks scroll independently without widening the page.

The index uses a compact asymmetric brand block within a 1040px container. On wide screens the Harmony mark leads from the left, a one-pixel rule separates it from the exact library definition and two documentation actions on the right, and four linked capability panels form a two-column technical index below. The brand block stacks below 960px, the rule disappears, and the capability index becomes one column below 640px; the mark reduces from 256px to 208px and then 168px.

**The Homepage Exception Rule.** Only the documentation index may use the compact brand Hero and four capability panels; ordinary documents retain the standard VitePress shell.

## Elevation & Depth

The system is flat. Dividers, tonal surface shifts, alternating table rows, and theme-aware code surfaces establish hierarchy without raised cards. The homepage mark alone may use a shallow separation shadow and a broad, low-intensity cobalt/cyan field; this atmosphere is not surface elevation and must not spread to panels or content.

**The Paper-First Rule.** Documentation surfaces stay flat; hierarchy comes from type, spacing, and one-pixel boundaries.

**The Halo Exception Rule.** Only the homepage mark may sit over the broad, pale, slightly asymmetric two-ellipse halo; keep both ellipses diffuse and visibly weaker than the cobalt actions.

## Shapes

Capability and code panels use compact 10px corners; tables and custom blocks use 8px. Homepage actions use restrained 20px pill corners around a 40px control. The mark halo is wider than the icon and deliberately uneven, using two overlapping ellipses rather than a centered circular glow. Avoid stacking rounded rectangles when a table, rule, or open document flow communicates structure more clearly.

## Components

### Navigation

Desktop navigation presents Guide, Patch API, React, and npm as a compact horizontal set beside search, language, theme, and GitHub controls. Mobile uses the native VitePress menu rather than squeezing desktop links into the header. The 30px Harmony mark anchors both layouts.

### Homepage Hero

The homepage opens with Harmony, the short runtime-Patch statement, the exact canonical library definition, two documentation actions, and the interlocking-ring mark. It is a compact technical introduction, not a campaign composition. On wide screens the mark leads into the copy from the left across a quiet vertical rule; on smaller screens the mark stacks above centered copy.

### Documentation Actions

The primary action is a solid Deep Cobalt 40px pill leading to installation. The secondary action is a quiet cool-neutral 40px pill leading to Patch authoring. Hover changes color only; visible focus uses the shared cobalt ring, and neither action lifts or animates decoratively.

### Capability Panels

Exactly four flat, icon-free panels route to Source Patches, Semantic Patches, React-aware Patches, and runtime control. They form a two-column technical index on wide and intermediate screens, then one column on narrow screens. Each uses a Cool Surface fill, a low-contrast boundary, 10px corners, 24px internal padding, concise technical copy, and a text link. The panels describe real Patch layers; they are not a generic card vocabulary for ordinary document sections.

### Code And Data

Code blocks use Cool Surface with Service Ink in light mode and Code Navy with light text in dark mode, Source Code Pro, a subtle cool border, and 10px corners. Tables use a single outer 8px boundary, horizontal dividers, and alternating cool surfaces. Both prioritize scanability over decoration.

## Do's and Don'ts

### Do

- **Do** preserve a 72ch maximum prose measure and clear heading hierarchy on ordinary documents.
- **Do** reserve the compact Hero and exactly four capability panels for the documentation index.
- **Do** pair the Harmony mark with the exact library definition and direct installation or authoring actions.
- **Do** keep English and Simplified Chinese homepage structure equivalent.
- **Do** keep the two-ellipse homepage halo broad, pale, and slightly asymmetric.
- **Do** respect reduced-motion preferences and visible keyboard focus.

### Don't

- **Don't** expand the index into a full-size marketing landing page or product showcase.
- **Don't** add promotional proof, metrics, testimonials, screenshot walls, or benchmark claims.
- **Don't** add icons to turn the capability panels into generic feature cards.
- **Don't** intensify the halo, repeat it behind content, or use it as a general elevation effect.
- **Don't** use decorative motion, animated backgrounds, or attention-seeking transitions.
- **Don't** introduce dense dashboard styling or decorative game-mod motifs.
