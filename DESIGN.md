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
  ink: "#10233f"
  ink-secondary: "#40536d"
  ink-muted: "#63738a"
  code-navy: "#0b1f3a"
typography:
  display:
    fontFamily: "Atkinson Hyperlegible Next Variable, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 3.25rem)"
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
  control: "10px"
  content: "8px"
  panel: "10px"
spacing:
  xs: "8px"
  sm: "18px"
  md: "24px"
  lg: "48px"
components:
  code-block:
    backgroundColor: "{colors.code-navy}"
    textColor: "#eef5ff"
    rounded: "{rounded.panel}"
    typography: "{typography.mono}"
---

# Design System: dsh-harmony Documentation

## Overview

**Creative North Star: "Layered Tracing Film"**

The documentation behaves like a precise service manual. The original plugin remains conceptually visible while each Patch adds a controlled, reversible layer. The result should feel native to DeepSeek Harness: calm, exact, and built for sustained technical reading.

Expression comes from the interlocked Harmony mark in navigation, cool paper surfaces, cobalt links, and unusually clear typography. The standard documentation shell leads; decoration never competes with instructions, source examples, or runtime state.

**Key Characteristics:**

- Cool white paper with cobalt reserved for actions and links.
- Compact headings paired with highly legible long-form text.
- Persistent navigation, page outline, tables, and copyable command blocks.
- No decorative motion or promotional first-viewport artwork.

## Colors

The palette is a cool technical neutral system with one cobalt action color.

### Primary

- **Runtime Cobalt** (`#075ff7`): primary actions, links, numbered trace nodes, and active brand emphasis.
- **Deep Cobalt** (`#0c47b2`): stronger brand contrast and pressed-depth support.

### Neutral

- **Cool Paper** (`#f9fbff`): default page background.
- **Cool Surface** (`#edf3fc`): secondary controls and quiet grouped surfaces.
- **Service Ink** (`#10233f`): primary text and headings.
- **Secondary Ink** (`#40536d`): descriptions and supporting copy.
- **Code Navy** (`#0b1f3a`): code block background.

**The One Accent Rule.** Cobalt marks actionable links, focus, and brand identity; neutral surfaces carry everything else.

## Typography

**Display and Body Font:** Atkinson Hyperlegible Next Variable, with a generic sans-serif fallback.

**Label/Mono Font:** Source Code Pro Variable, with a generic monospace fallback.

The pairing prioritizes character recognition and durable reading over fashionable neutrality. Display text is tightly tracked and compact; prose remains open, measured, and limited to roughly 72 characters per line.

### Hierarchy

- **Display** (700, `clamp(2.25rem, 5vw, 3.25rem)`, 1.08): page titles, including the documentation index.
- **Headline** (600, `1.5rem`, 1.3): document sections.
- **Body** (460, `17px`, 1.72): documentation prose and lists.
- **Mono** (`0.82rem`): paths, provider identifiers, runtime generations, and code.

**The Whole-Word Rule.** Technical nouns and key transformation terms must receive enough width to wrap between words, never inside them.

## Layout

Content uses VitePress's standard documentation shell: persistent sidebar on desktop, page outline where space permits, and a narrow reading column capped near 72 characters. Major sections use a consistent 48px interval.

The index begins with the library definition, requirements, and installation commands before presenting task-oriented navigation and the runtime model. Below 768px, native VitePress controls replace the sidebar and outline. Tables fit the content width; code blocks scroll independently without widening the page.

## Elevation & Depth

The system is flat. Dividers, alternating table rows, and the dark code surface establish hierarchy without shadows, glows, or translucent decoration.

**The Paper-First Rule.** Documentation surfaces stay flat; hierarchy comes from type, spacing, and one-pixel boundaries.

## Shapes

Code panels use a compact 10px radius; tables and custom blocks use 8px. Borders are cool, low-contrast dividers rather than card outlines. Avoid stacking rounded rectangles when a table, rule, or open document flow communicates structure more clearly.

## Components

### Navigation

Desktop navigation presents Guide, Patch API, React, and npm as a compact horizontal set beside search, language, theme, and GitHub controls. Mobile uses the native VitePress menu rather than squeezing desktop links into the header. The 30px Harmony mark anchors both layouts.

### Code And Data

Code blocks use Code Navy, Source Code Pro, a subtle cool border, and 10px corners. Tables use a single outer 8px boundary, horizontal dividers, and alternating cool surfaces. Both prioritize scanability over decoration.

### Documentation Index

The index uses ordinary headings, paragraphs, command blocks, and tables inside the same shell as every guide. It opens with installable facts and routes readers by task; it does not use a Hero, promotional actions, product screenshots, or custom feature sections.

## Do's and Don'ts

### Do

- **Do** preserve a 72ch maximum prose measure and clear heading hierarchy.
- **Do** put requirements and runnable commands before conceptual explanation on the index.
- **Do** keep English and Simplified Chinese navigation structurally equivalent.
- **Do** respect reduced-motion preferences and visible keyboard focus.

### Don't

- **Don't** turn each concept into an equal rounded card.
- **Don't** turn the documentation index into a marketing Hero or product showcase.
- **Don't** use decorative motion, background geometry, or large screenshots on the index.
- **Don't** introduce dense dashboard styling, decorative game-mod motifs, or flashy motion.
