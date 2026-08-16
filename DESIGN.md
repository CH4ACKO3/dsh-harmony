---
name: dsh-harmony Documentation
description: A layered service manual for runtime Patch coordination.
colors:
  cobalt: "#075ff7"
  cobalt-hover: "#0752d6"
  cobalt-deep: "#0c47b2"
  cyan-trace: "#1ba8ff"
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
    fontSize: "clamp(3.5rem, 8vw, 6rem)"
    fontWeight: 740
    lineHeight: 0.94
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Atkinson Hyperlegible Next Variable, sans-serif"
    fontSize: "clamp(2.1rem, 4vw, 3.2rem)"
    fontWeight: 620
    lineHeight: 1.03
    letterSpacing: "-0.035em"
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
  content: "12px"
  panel: "14px"
  media: "16px"
spacing:
  xs: "8px"
  sm: "18px"
  md: "24px"
  lg: "42px"
  section: "72px"
  page: "120px"
components:
  button-primary:
    backgroundColor: "{colors.cobalt}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "12px 20px"
    typography: "{typography.body}"
  button-secondary:
    backgroundColor: "{colors.cool-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
    typography: "{typography.body}"
  code-block:
    backgroundColor: "{colors.code-navy}"
    textColor: "#eef5ff"
    rounded: "{rounded.panel}"
    typography: "{typography.mono}"
---

# Design System: dsh-harmony Documentation

## Overview

**Creative North Star: "Layered Tracing Film"**

The documentation behaves like a precise service manual laid out on translucent technical sheets. The original plugin remains conceptually visible while each Patch adds a controlled, reversible layer. The result should feel native to DeepSeek Harness: calm, exact, and built for sustained technical reading.

Expression comes from a small set of purposeful signals: the interlocked Harmony mark, cobalt-to-cyan runtime paths, cool paper surfaces, and unusually clear typography. Decoration never competes with instructions, source examples, or runtime state.

**Key Characteristics:**

- Cool white paper with cobalt and cyan operational traces.
- Large, tightly set headings paired with highly legible long-form text.
- Continuous paths and translucent layers instead of generic feature cards.
- Restrained motion that explains runtime flow and respects reduced-motion settings.

## Colors

The palette is a cool technical neutral system with one cobalt action color and a brighter cyan used only to show movement along a path.

### Primary

- **Runtime Cobalt** (`#075ff7`): primary actions, links, numbered trace nodes, and active brand emphasis.
- **Deep Cobalt** (`#0c47b2`): stronger brand contrast and pressed-depth support.
- **Trace Cyan** (`#1ba8ff`): moving runtime indicators; it is not a second action color.

### Neutral

- **Cool Paper** (`#f9fbff`): default page background.
- **Cool Surface** (`#edf3fc`): secondary controls and quiet grouped surfaces.
- **Service Ink** (`#10233f`): primary text and headings.
- **Secondary Ink** (`#40536d`): descriptions and supporting copy.
- **Code Navy** (`#0b1f3a`): code block background.

**The Signal Path Rule.** Cobalt marks an actionable or structural point; cyan appears only as movement between those points.

## Typography

**Display and Body Font:** Atkinson Hyperlegible Next Variable, with a generic sans-serif fallback.

**Label/Mono Font:** Source Code Pro Variable, with a generic monospace fallback.

The pairing prioritizes character recognition and durable reading over fashionable neutrality. Display text is tightly tracked and compact; prose remains open, measured, and limited to roughly 72 characters per line.

### Hierarchy

- **Display** (740, `clamp(3.5rem, 8vw, 6rem)`, 0.94): product name in the home Hero.
- **Headline** (620, `clamp(2.1rem, 4vw, 3.2rem)`, 1.03): major home-page arguments and flow explanations.
- **Document title** (`clamp(2.5rem, 6vw, 4.3rem)`, 1): guide titles.
- **Body** (460, `17px`, 1.72): documentation prose and lists.
- **Mono** (`0.82rem`): paths, provider identifiers, runtime generations, and code.

**The Whole-Word Rule.** Technical nouns and key transformation terms must receive enough width to wrap between words, never inside them.

## Layout

Content sits in a 1152px maximum-width system with 24px edge padding. Home sections use generous 72–120px vertical intervals, while document prose follows VitePress's narrower reading column and 72ch measure.

The runtime flow begins with a two-column argument and becomes a continuous three-node horizontal rail. Below 768px, the argument becomes one column and the rail becomes a vertical sequence. Hero artwork is deliberately separated from the text on mobile so the Harmony mark remains complete and unobstructed. The page root clips decorative geometry and must never introduce horizontal scrolling.

## Elevation & Depth

Depth is ambient rather than structural. Most information remains on the paper plane; elevation belongs to the Harmony mark, primary action, media previews, and code blocks. Translucent concentric geometry supplies atmosphere without becoming a separate surface.

### Shadow Vocabulary

- **Primary action** (`0 10px 24px rgba(7, 95, 247, 0.22)`): the main Hero button only.
- **Code surface** (`0 18px 42px rgba(13, 36, 71, 0.12)`): separates executable examples from prose.
- **Media preview** (`0 28px 70px rgba(15, 49, 100, 0.2)`): reserved for screenshots and rendered output.

**The Paper-First Rule.** Surfaces stay flat by default; shadow is evidence of a distinct interactive or rendered layer.

## Shapes

Controls use a compact 10px radius, tables and custom blocks use 12px, code panels use 14px, and media uses 16px. Trace nodes are circular and sit directly on a thin path. Borders are cool, low-contrast dividers rather than card outlines. Avoid stacking rounded rectangles when a rule, rail, or open layout communicates structure more clearly.

## Components

### Buttons

- **Primary:** runtime cobalt, white text, 10px radius, strong weight, and a restrained cobalt shadow.
- **Secondary:** cool surface, service ink, the same geometry, and no competing shadow.
- **Focus:** a visible 3px translucent cobalt outline with 3px offset.

### Navigation

Desktop navigation presents Guide, Patch API, React, and npm as a compact horizontal set beside search, language, theme, and GitHub controls. Mobile uses the native VitePress menu rather than squeezing desktop links into the header. The 30px Harmony mark anchors both layouts.

### Runtime Trace

Three numbered nodes share one line on desktop: Original plugin, Ordered Patches, Runtime source. The line becomes vertical on mobile. A cyan gradient travels along the line over four seconds and disappears when reduced motion is requested. Nodes and text remain open on the page plane; they are not cards.

### Code And Data

Code blocks use Code Navy, Source Code Pro, a subtle cool border, and 14px corners. Tables use a single outer 12px boundary, horizontal dividers, and alternating cool surfaces. Both prioritize scanability over decoration.

## Do's and Don'ts

### Do

- **Do** use uninterrupted paths to explain ordered runtime transformations.
- **Do** preserve a 72ch maximum prose measure and clear heading hierarchy.
- **Do** keep English and Simplified Chinese navigation structurally equivalent.
- **Do** respect reduced-motion preferences and visible keyboard focus.

### Don't

- **Don't** turn each concept into an equal rounded card.
- **Don't** use cyan as a general-purpose button or link color.
- **Don't** crop, obscure, or flatten the three-dimensional Harmony mark.
- **Don't** introduce dense dashboard styling, decorative game-mod motifs, or flashy motion.
