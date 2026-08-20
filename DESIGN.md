---
name: dsh-harmony
description: Native, precise Patch ordering inside DeepSeek Harness Settings.
colors:
  business-accent: "var(--dsw-alias-state-business-primary)"
  label-primary: "var(--dsw-alias-label-primary)"
  label-secondary: "var(--dsw-alias-label-secondary)"
  label-tertiary: "var(--dsw-alias-label-tertiary)"
  surface-layer-1: "var(--dsw-alias-bg-layer-1)"
  surface-layer-2: "var(--dsw-alias-bg-layer-2)"
  surface-module: "var(--dsw-alias-bg-module-platform)"
  border-subtle: "var(--dsw-alias-border-l2)"
  interactive-hover: "var(--dsw-alias-interactive-bg-hover)"
  interactive-selected: "var(--dsw-specific-sidebar-nav-item-active)"
  error: "var(--dsw-alias-state-error-primary)"
  warning: "#d97706"
  warning-border: "rgba(217,119,6,.24)"
  warning-surface: "rgba(217,119,6,.1)"
  drop-fluorescent: "#3b82f6"
  on-accent: "#fff"
typography:
  display:
    fontFamily: "inherit"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: "30px"
  headline:
    fontFamily: "inherit"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: "26px"
  section:
    fontFamily: "inherit"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "24px"
  title:
    fontFamily: "inherit"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: "20px"
  body:
    fontFamily: "inherit"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "20px"
  label:
    fontFamily: "inherit"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: "16px"
  support:
    fontFamily: "inherit"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "19px"
  caption:
    fontFamily: "inherit"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "18px"
  micro:
    fontFamily: "inherit"
    fontSize: "9px"
    fontWeight: 400
    lineHeight: "14px"
rounded:
  indicator: "2px"
  badge: "5px"
  micro: "6px"
  control: "8px"
  row: "9px"
  patch: "10px"
  stack: "12px"
  container: "14px"
spacing:
  tight: "6px"
  compact: "10px"
  regular: "14px"
  roomy: "16px"
components:
  tab-active:
    backgroundColor: "transparent"
    textColor: "{colors.label-primary}"
    typography: "{typography.title}"
    padding: "0 2px 10px"
  plugin-cover:
    backgroundColor: "{colors.surface-layer-2}"
    textColor: "{colors.label-primary}"
    typography: "{typography.title}"
    rounded: "{rounded.stack}"
    padding: "9px 11px"
    minHeight: "48px"
  patch-card:
    backgroundColor: "{colors.surface-layer-2}"
    textColor: "{colors.label-primary}"
    typography: "{typography.title}"
    rounded: "{rounded.patch}"
    padding: "6px 9px 6px 0"
    minHeight: "48px"
  button-primary:
    backgroundColor: "{colors.business-accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "30px"
  drop-placeholder:
    backgroundColor: "{colors.drop-fluorescent}"
    rounded: "{rounded.indicator}"
    height: "2px"
    slotHeight: "10px"
---

# Design System: dsh-harmony

## Overview

**Creative North Star: "The Native Ordering Ledger"**

dsh-harmony should read as a focused capability already present in DeepSeek Harness Settings. Its interface is calm, compact, and literal: ordinary lists expose an exact global order, tonal surfaces establish containment, and small state changes communicate selection or intent without introducing a separate dashboard identity.

The visual system inherits the host Settings vocabulary instead of establishing an independent brand layer. Precision comes from clear indices, restrained metadata, consistent focus treatment, and direct manipulation whose keyboard equivalent produces the same result.

**Key Characteristics:**

- Host-native typography, colors, spacing, and Settings navigation.
- Ordering is visually primary; inspection remains secondary and does not interrupt list context.
- Stacks reduce repetition without changing the meaning of the flat order.
- Quiet, state-driven motion that disappears under reduced-motion preferences.
- Blue is functional and scarce: active tabs, focus, bound state, primary action, and drop intent.

## Colors

The palette is inherited from DeepSeek Harness theme aliases so light and dark themes remain host-coherent. Harmony adds no independent palette.

### Primary

- **Business Accent:** Marks the active tab, visible keyboard focus, primary action, bound state, and drag destination. Its rarity makes interactive intent immediately legible.

### Tertiary

- **Error:** Reserved for failed Patch state, failed reloads, and destructive actions; pair it with text or status semantics rather than color alone.

### Neutral

- **Primary Label:** Main headings, Patch names, active labels, and high-confidence content.
- **Secondary Label:** Supporting copy and quieter controls.
- **Tertiary Label:** Metadata, indices, hints, and inactive state indicators.
- **Layer 1:** List wells and subdued containers.
- **Layer 2:** Patch cards, stack headers, dialogs, and toasts.
- **Module Surface:** Preview placeholders, constraint callouts, and the visual underlay of a collapsed stack.
- **Subtle Border:** Separates containers and cards without creating a boxed dashboard aesthetic.
- **Hover Surface:** Provides a host-consistent, low-contrast hover response.
- **Selected Surface:** Connects the selected list item to the host Settings selection language.

### Named Rules

**The Host Owns the Palette Rule.** Use DeepSeek Harness semantic aliases at runtime; do not hard-code a competing light or dark theme.

**The Functional Blue Rule.** The business accent communicates current state or immediate action. Do not use it decoratively.

## Typography

**Display Font:** The host Settings font stack (inherited)
**Body Font:** The host Settings font stack (inherited)
**Label/Mono Font:** The host stack for labels; the host-compatible system monospace stack only for source inspection.

**Character:** Compact and utilitarian without becoming developer-dense. Weight, color, and line-height establish hierarchy; Patch identifiers keep their natural casing and are never stylized as marketing copy.

### Hierarchy

- **Headline:** Semibold host text for the page title; compact enough to remain subordinate to the Settings dialog.
- **Title:** Semibold host text for plugin and Patch names, active tabs, and other scan anchors.
- **Body:** Regular host text for guidance and descriptions; explanatory lines stay near 68–70 characters where space allows.
- **Label:** Small, quiet text for indices, target paths, counts, badges, and state metadata. Tabular numerals keep order indices aligned.

### Named Rules

**The Scan Anchor Rule.** Patch and plugin names carry the strongest local weight; indices and target paths recede but remain readable.

**The Natural Case Rule.** Preserve technical names and labels in their source casing. Do not add all-caps styling or decorative tracking.

## Layout

The Harmony surface fills the available Settings content area as a vertical workspace: tabs and title are fixed-height context, the list/detail workspace absorbs remaining height, and Save stays at the footer. Desktop uses a compact ordering list beside a more generous detail region; the list takes two parts of the width and detail takes three.

List containers use compact vertical rhythm and internal scrolling. Each Patch occupies a single ordinary list position. Expansion lays every Patch card directly into that same sequence at full width and spacing; there is no nested indentation, branch line, or persistent plugin header.

At the compact breakpoint (680px and below), switch to ordering-first mode. Reduce the Settings navigation to a 52px accessible icon rail while retaining programmatic labels, hide introductory copy and the detail region, compact the list, and make Save full-width. Do not squeeze desktop inspection content below the ordering list.

**The Ordering-First Rule.** When horizontal space is constrained, preserve the ordering list and its direct manipulation before the desktop detail region.

**The One-Dimensional Rule.** Regardless of viewport or grouping, present Patch order as one vertical sequence with ordinary list semantics.

## Elevation & Depth

The system is flat by default. Depth is conveyed through host tonal layers, subtle borders, and the real Patch cards offset behind a collapsed plugin cover. Shadows are reserved for transient overlays such as confirmation dialogs and reload toasts, using the host elevation tokens rather than Harmony-specific effects.

### Shadow Vocabulary

- **Transient Overlay:** The host level-2 shadow supports toasts that sit above Settings.
- **Modal Overlay:** The host level-3 shadow supports confirmation and runtime dialogs over the host mask.

### Named Rules

**The Flat-at-Rest Rule.** Persistent list and detail surfaces remain border-and-tone based. Shadow never substitutes for list hierarchy.

**The Honest Stack Rule.** A stack of N Patches contains N real Patch cards plus one plugin cover card. Decorative pseudo-card underlays must not substitute for the actual card count.

## Shapes

Corners are gently rounded and compact, following the host Settings language. Small badges use the tightest radius, controls use a modest radius, Patch rows use a slightly softer radius, stack and preview surfaces use the larger card radius, and outer list/dialog containers use the broadest radius. Borders stay one pixel and low contrast.

Collapsed stack geometry is defined by card bottom corners, not by a shared card height. The plugin cover's lower-left and lower-right corners are the explicit progress-0 endpoints. Begin with `12px × ln(N) / N`, then let each Patch contribute a weighted vertical gap: normal ×1, disabled ×0.5, and warning or error ×1.5; clamp every resulting gap to a 2px minimum. Each Patch bottom edge moves down by the cumulative gaps, while its lower-left and lower-right corners interpolate toward the deepest card's fixed 12px inset by `cumulative / total`. The card grows upward from that bottom edge at its own natural height, so differently sized covers and Patch cards preserve the same linear side envelope. Expansion rapidly fades the cover while those same Patch cards slide into ordinary list positions. Collapse reverses the relationship: cards slide together first and the cover fades back over the completed stack.

## Components

### Tabs

- **Style:** Text tabs sit on a single subtle divider. The selected tab uses primary label color, semibold weight, and a two-pixel business-accent underline.
- **Focus:** Use a visible two-pixel business-accent outline with offset; selection is also exposed through tab semantics.
- **Behavior:** Tabs change the Settings page only. They never alter Patch order.

### Buttons

- **Shape:** Compact controls with gently curved corners.
- **Primary:** The Save action uses the business accent with white text and becomes a neutral disabled control when there is no unsaved order.
- **Undo:** Place a secondary Undo action immediately beside Save. Enable both while the draft order or Patch enablement differs from the last saved profile; Undo restores both, removes transient merge barriers, and returns cards to their default collapsed grouping with the same layout motion used by reordering.
- **Hover / Focus:** Hover is a slight brightness change; keyboard focus uses a visible business-accent outline. Keep movement out of button feedback.
- **Secondary:** Border-and-surface buttons carry cancellation, retry, and non-primary dialog actions. Destructive text uses the error role.
- **Enablement:** Plugin details expose one plugin-wide Patch enable/disable action; Patch details expose one individual action. These actions update the same draft as ordering and take effect only through Save; Undo restores their saved values. The plugin-wide action changes only its independent `plugin/*` flag and preserves every individual Patch flag. The Patch Status tab exposes no mutation controls.

### Cards / Containers

- **Corner Style:** Large list wells and dialogs use the broadest corner; stack headers and Patch cards step down in radius.
- **Background:** Layer 1 contains the sequence; Layer 2 carries the items within it.
- **Shadow Strategy:** Persistent cards have no shadow. Only overlays use host elevation.
- **Border:** A subtle host border defines list wells, stack headers, and Patch cards.
- **Internal Padding:** Dense but breathable; Patch rows maintain a 48px minimum height and stack headers a 56px minimum height on desktop.

### Patch Status Monitor

- **Runtime Language:** Present a successfully bound Patch as enabled; binding remains an implementation fact, not the user-facing state name.
- **Patch List:** Keep the monitor list compact and narrower than the ordering list. Each row shows the Patch name and state on the first line, its provider plugin on the second, and its target on the third.
- **Source Disclosure:** Original and final source are collapsed by default. Each intermediate Patch result is independently collapsible and opens by default.
- **Source Sections:** Present original source, intermediate results, and final source as one continuous document separated by horizontal rules. Expanded content uses the same fine divider below its heading instead of placing every section in a separate card; sticky handoffs overlap that shared divider on one pixel rather than stacking two rules.
- **Source Navigation:** Expanded section headings show the target language and file, keep their lower divider while pinned directly against the detail viewport's inner top border, and remain visible while that section is in view. The detail pane owns vertical scrolling; source bodies scroll only horizontally, with an always-visible synchronized horizontal rail pinned directly against the inner bottom border while its section is in view. The rail supports both track clicks and direct thumb dragging.
- **Intermediate Diff:** Compare every intermediate result with the immediately preceding source. Show added and removed lines with paired old/new line numbers, retain three context lines around changes, and compress unchanged spans without hiding the step identity or match count.

### Patch Ordering List

The persisted and draft ordering model is a single flat `patchOrder`. Rendering reconciles that sequence into contiguous same-owner stacks and a transient drag placeholder, but only the flat sequence is authoritative. A one-Patch run is the smallest stack, not a separate node type.

- **One-Patch Stack:** Any contiguous run containing one Patch first renders as a plugin card showing its package, version, `1 Patch`, Patch name, and state. Activating it reveals the Patch card in place without changing order; activating that Patch then selects its Patch details and keeps the Patch face visible while selected. `Escape` may explicitly return it to the plugin face. It never renders a redundant stacked underlay.
- **Collapsed Stack:** Two or more contiguous Patches with the same owner render as N real stacked Patch cards plus one plugin cover by default. The cover displays owner, Patch count, and inclusive global range.
- **Expanded Stack:** Releasing a cover without crossing the eight-pixel drag threshold directly expands the stack, even when pointer jitter prevents the browser from synthesizing a click. Suppress only the duplicate click from that same pointer cycle; keyboard click remains available. Expansion rapidly fades the cover and slides the same Patch cards into full-width, ordinary list positions. There is no nested visual level or remaining plugin header, and expansion never changes order.
- **Collapsed Hit Area:** The entire visible stack silhouette, from the plugin cover through the bottom edge of the deepest Patch card, acts as the cover's pointer target. The semantic button remains the plugin cover itself.
- **Selection:** Plugin covers and individual Patch cards select independently for detail content. While a selection exists, every card and stack from its plugin remains full width and visually unchanged, while cards and stacks from other plugins contract to 75% width from the left edge. Only the exact selected cover or Patch keeps the same one-pixel inset edge used by hover; sibling cards from the selected plugin receive no additional edge. Selecting a Patch replaces the right-hand plugin summary with that Patch's declared description, identity, declaration, target, state, and runtime facts.
- **Detail Attribution:** Plugin and Patch details both show the provider package's author using the same package-scope-aware formatting.
- **Status Link:** Place a `View details` secondary action immediately after the Patch enable/disable action in ordering details. It opens the same Patch in the read-only status monitor.
- **Detail Scroll Edge:** Keep one compact spacing step between detail content and its vertical scrollbar so previews and text never sit under the browser-owned scroll surface.
- **Recall Gesture:** Holding either a plugin cover or a Patch for 620ms without crossing the drag threshold gathers every global Patch owned by that plugin at the held card's position, restores declaration order within the plugin, removes internal merge barriers, and continues the same press as a drag of the collapsed stack. Releasing without moving leaves the stack at its recalled position. Crossing the drag threshold before recall cancels it immediately; an ordinary click is never delayed.
- **Dynamic Reconciliation:** After any move, regroup only the contiguous runs produced by the current flat order. A Patch moved across plugin boundaries may become a one-Patch stack, join another same-owner run, or split its former run.
- **Drag Scope:** Drag one expanded Patch, or drag a collapsed plugin cover to move every Patch in that contiguous stack as one ordered group. Both operations mutate the same flat `patchOrder`; the cover does not create a separate plugin-order model.
- **Top-Card Targets:** Hit testing includes only cards visually on top: expanded Patch cards and collapsed plugin covers. The real Patch cards underneath a collapsed cover never become hidden drop targets.
- **Drop Intent:** When the pointer is not over a top card, project to the nearest global gap, separate the adjacent rendered items, and show one fluorescent-blue insertion line. When the pointer is over a top card, suppress the line and resolve to that card's nearest edge on release. Drag preview and placeholder state are transient view data and are never persisted.
- **Collapsed Drop Target:** Hovering a collapsed destination stack while dragging expands it after 460ms so the user can choose an exact position inside the run.
- **Automatic Collapse:** Compute one vertical band over the entire contiguous same-owner run, including expanded and already-collapsed sub-stacks. Keep every expanded key open while the pointer Y remains between that run's minimum top and maximum bottom, or while the run contains the selected Patch. Once neither condition holds, collapse after 520ms unless the pointer returns. `Escape` remains an explicit collapse action.
- **Merge Barrier:** When adjacent same-owner cards could reconcile into a stack, evaluate all transient boundaries in the contiguous run as one unit. Keep every boundary while the pointer Y remains inside the run's combined vertical band, and remove all of them only after it leaves. Any collapsed stack already present stays collapsed rather than opening as a side effect.
- **Release Safety:** Finalize drag from a window-level captured release event. Resolve the destination while the active drag context still exists, then clear preview, placeholder, and dragging state, so a fast release outside the list behaves identically to a long drag.
- **Scrolling:** Keep native wheel scrolling inside the list during drag. When the pointer is outside the list, route wheel deltas to the list so long-distance placement remains possible without ending the drag.
- **Keyboard Path:** With a Patch focused, Alt+Arrow Up or Alt+Arrow Down moves it exactly one global position and restores focus to that Patch. Keyboard and pointer paths update the same flat draft order.
- **Semantics:** The outer sequence is a list, covers expose expanded state, drag controls have explicit accessible names, and drop/status feedback is announced without replacing list semantics. Hidden stacked Patch controls leave the focus order until expansion.

**The Flat Truth Rule.** A stack is a view-only compression of adjacent rows. Never persist stacks, derive a separate plugin order, or let stack UI mutate order implicitly.

**The Exact Placement Rule.** Every move resolves to one global Patch index, regardless of owner or current visual grouping.

### Patch and Stack States

- **Hover:** Add one inset pixel to the hovered card edge without changing its surface color or dimensions.
- **Selected:** Keep the selected owner at full width and contract every other owner to 75% from the left edge. Give only the exact selected Patch card or cover the same one-pixel inset edge as hover. Preserve status surfaces and border hues; selection never adds another fill color or edge to same-owner siblings.
- **Dragging:** Lower the active Patch or stack opacity, render a pointer-following card or honest N-layer stack preview, and expose an insertion line only when the pointer is between top-card targets.
- **Card Status:** Keep presentation status separate from runtime binding state. `normal`, `warning`, `error`, and `disabled` are stable card states; runtime failure maps to error, runtime disablement maps to disabled, and ordering violations may map to warning.
- **Warning:** Use a restrained orange-yellow tint and border. It contributes 1.5 times the normal stacked gap; the card itself replaces a separate order-conflict banner.
- **Error:** Use a subdued error-red tint rather than a saturated alert fill. It contributes 1.5 times the normal stacked gap.
- **Disabled:** Use a shallow neutral-gray tint and secondary text. It contributes half the normal stacked gap, still clamped to the shared lower bound.
- **Status Indicator:** Keep the small trailing Patch dot with an accessible title; color supplements the card tint rather than carrying status alone. Exclude disabled Patches, then compute normal, warning, and error shares independently across the remaining group and mix those shares as white, orange-yellow, and error red. This keeps the channels independent: half normal plus half error is exactly half white and half red with no orange contribution. The trailing dot uses that aggregate color directly; the collapsed cover and drag preview mix 10% of it into the ordinary layer surface so the same continuous state remains visible without overwhelming the list. If every Patch is disabled, bypass the health mix and render the dot neutral gray and the cover as a gray-only surface with a disabled label. The accessible title otherwise reports healthy or the warning/error counts.
- **Focus:** Use an inset two-pixel business-accent outline so focus remains visible without changing dimensions.

### Navigation

- **Desktop:** Preserve the official Settings navigation, labels, spacing, and selected-item treatment.
- **Panel Width:** Preserve the host Settings panel's original 800px width for every non-Harmony destination. While Harmony content is active, expand the same panel to 1200px, capped by the host viewport maximum, and smoothly return to 800px when another destination is selected. The ordering list may grow to 450px; keep the status list narrower at no more than 320px and let either list contract to its 250px ordering or 220px status minimum when space is constrained. The detail column consumes the remainder.
- **Mobile:** Use an accessible icon rail rather than a new navigation pattern. Hide visible labels with a screen-reader-preserving technique and keep each target large enough to operate.
- **Harmony Mark:** Render as a monochrome mask inheriting the current text color, so it responds naturally to host theme and state.

### Motion

Motion is short and state-specific: the plugin cover fades out in 110ms, Patch cards use a 380ms FLIP expansion and 320ms collapse with confident exponential deceleration, the returning cover fades in after the cards begin regrouping, and toasts enter in 180ms. The animation preserves the identity and position of every real Patch card. Under `prefers-reduced-motion: reduce`, expansion and collapse update immediately without spatial movement while state and focus remain legible.

**The State, Not Spectacle Rule.** Motion may clarify expansion, selection, dragging, or transient feedback. It never celebrates routine ordering or delays direct manipulation.

## Do's and Don'ts

### Do:

- **Do** treat the flat global Patch sequence as the sole source of ordering truth.
- **Do** derive same-owner stacks only from contiguous Patches in the current sequence.
- **Do** keep pointer, keyboard, save, and close-guard behavior aligned to the same draft order.
- **Do** preserve visible focus, semantic lists, expanded state, and non-color status cues.
- **Do** prioritize ordering on compact screens and keep navigation accessible when labels are visually reduced.
- **Do** use host semantic tokens so the surface stays coherent in light and dark themes.

### Don't:

- **Don't** persist stack identity, expansion, or placeholder state.
- **Don't** reorder sibling Patches during ordinary selection or drag. Reorder all same-owner siblings only through the explicit hold-to-recall gesture.
- **Don't** infer plugin precedence from visual stacks or use stacks as a second ordering model.
- **Don't** hide the exact insertion point behind a generic stack-level drop action.
- **Don't** introduce decorative game-mod styling, dashboard chrome, or independent theme colors.
- **Don't** rely on drag alone; preserve the Alt+Arrow path and focus continuity.
- **Don't** animate under a reduced-motion preference.
