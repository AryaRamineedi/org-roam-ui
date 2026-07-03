# org-ascipio visual roadmap

Context: the first two build passes on org-ascipio deliberately prioritized
*architecture and functionality* — live graph data, the camera-fix, and then
click-to-open/sidebar/agenda/search/filters/local-graph-widget — over visual
design. That was the right order (a fast, correct, functional app beats a
pretty broken one), but it means the app currently looks like "a graph of
plain dots and lines," barely distinguished from org-roam-ui's own bare
force-graph. This document is the plan for closing that gap, and to make the
theming system (already built — see below) the foundation of a UI that's
genuinely more polished than org-roam-ui's, not just functionally ahead of
it.

## What's already done (foundation, not yet "polish")

This matters because every later phase below builds on it rather than
fighting it:

- **Theme sync is real and live**: Emacs pushes `ThemeTokens` automatically
  on any theme change (`enable-theme-functions` hook, not manual `M-x` like
  the old project), face-extraction works with *any* Emacs theme (Doom's
  color table is used only to enrich a few named accents when present, not
  as a requirement), and `theme/applyTheme.ts` is the single pipeline both
  a live Emacs push and a built-in preset (`theme/presets.ts`) go through.
- **The whole app re-skins, not just the graph.** Every chrome panel
  (`TopBar`, `NotePane`, `FilterPanel`, `SearchBox`, `LocalGraphWidget`,
  `SettingsPanel`) reads color through the shared
  `.ascipio-panel`/`.ascipio-chip`/`.ascipio-muted`/`.ascipio-button-primary`
  classes in `index.css`, which resolve to the same `--ascipio-*` CSS
  variables the graph reads via `graph/graphTheme.ts`. Switching a theme
  recolors the graph nodes/edges *and* every floating panel in one pass,
  with no reload — verified against both manual preset switching and a
  simulated live Emacs push.
- **Six curated presets** (`midnight`, `nord`, `solarized-dark/light`,
  `gruvbox`, `rose-pine`) cover the non-Emacs-connected case.
- **Continuous physics** (`graph/physics.ts`, a d3-force simulation wrapped
  by `GraphPhysicsEngine`) replaced the old one-shot static layout — nodes
  repel, links pull, and a per-node centering spring (`forceX`/`forceY`,
  not `forceCenter`, which only recenters the graph's *mean* and does
  nothing to stop an individual weakly-linked node drifting away forever)
  keeps the whole graph legibly bounded instead of collapsing into a tangle
  with flung outliers. Fully configurable live from the Settings panel's
  Physics tab (repulsion, link distance/strength, centering, collision
  radius, alpha/velocity decay), with drag-to-reposition (pins a node during
  drag, releases it back to the simulation on mouseup), and a "local" graph
  view mode that simulates/shows only the focused node's neighborhood as a
  full alternate main view (not just the corner widget). A **focus mode**
  (`App.tsx`, toggled from Settings → View, exits on Escape) hides all
  chrome for distraction-free viewing. All of this — physics parameters,
  color mode, view mode, local-widget visibility — round-trips to real
  Emacs `defcustom`s via `config:defaults` on connect and an "export as
  elisp" button in Settings → Export (see `docs/PROTOCOL.md`).

What's still missing is everything downstream of "the colors are correct":
information-dense visual language (color meaning something beyond "this is
the accent color"), typography, motion, and the graph's overall sense of
depth/hierarchy. That's this roadmap.

## Phase 1 — Node visual language (color-codes information)

Done, alongside this document (`graph/nodeColor.ts`, `graph/graphTheme.ts`,
`views/Settings/SettingsPanel.tsx`'s Appearance tab) — previously every node
was the same flat accent-blue regardless of what it represented:

- **A "color by" toggle** (Tag / TODO / Plain, in Settings → Appearance)
  switches `graphReducers.ts`'s node coloring mode live.
- **Tag mode**: nodes are colored by hashing their full tag *set* (sorted,
  joined) to one of the active theme's 8 accent colors — deterministic
  across reloads/sessions with no color assignment stored anywhere. Nodes
  sharing an identical tag set share a color; untagged nodes stay the
  neutral default. This is a single dominant color per node, not a
  multi-color pie/ring per individual tag — a node tagged `project,urgent`
  gets one hashed color for that exact pair, not a half-project/half-urgent
  split. True per-tag pie rendering is a real stretch goal but needs a
  custom Sigma node program (non-trivial); not attempted here.
- **TODO mode**: colors by `todo` state, preferring
  `ThemeTokens.todoColors` when Emacs supplies it (from
  `org-todo-keyword-faces`) and falling back to a red/orange/green split
  (TODO/NEXT → red, WAITING/other → orange, DONE/CANCELLED → green) when it
  doesn't. Directly serves the task-management use case: overdue/active
  work is visually distinct in the graph itself, not just in the agenda
  view.
- Not yet done: **size by connectivity, refined**. Already partly true (`4 + min(backlinks,
  12)`) but not visually tuned — needs a non-linear (sqrt/log) scale so a
  hub node doesn't visually dominate a 500-node graph, and a subtler size
  bump for the *selected* node (a ring/glow instead of just recoloring) so
  selection doesn't fight with tag-color meaning.

## Phase 2 — Edge visual language

- **Edge weight/opacity by link recency or link count between the same pair**
  (multi-edges currently collapse to one). Low priority unless citation/ref
  links land first (Phase 4 territory).
- **Directional cue**: subtle arrowheads or a gradient along the edge, so
  "A links to B" reads differently from "B links to A" without needing to
  hover — currently indistinguishable since the graph is undirected-looking
  even though the underlying graphology graph is directed.
- **Hover/selection edge halo**: edges touching the hovered/selected node get
  a soft glow rather than just full-opacity-vs-dimmed, for a less binary
  feel.

## Phase 3 — Typography & layout system

- Establish a real type scale (currently ad hoc `text-xs`/`text-sm`/`text-base`
  sprinkled per-component) — a `theme/typography.ts` or Tailwind theme
  extension defining 4-5 steps, applied consistently across NotePane,
  AgendaView, and the org-text renderer's heading levels (`h1`..`h6` right
  now just get `font-semibold` and nothing else — no visual hierarchy
  between a level-1 and level-4 heading).
- Consistent spacing scale for panel padding/gaps (currently `p-2`/`p-3`
  chosen ad hoc per component).
- A monospace or slightly-serif reading font for note content specifically
  (NotePane currently inherits the UI sans-serif everywhere, including body
  text, which reads worse for long-form notes than a body-text-appropriate
  font would).

## Phase 4 — Note-content rendering fidelity

`org/renderOrgText.tsx` is deliberately minimal (headings, links, bold/
italic/code) — functional but visually flat compared to real org-mode
rendering. In priority order for the next pass:

- Tables (`| a | b |` blocks) — currently render as garbled plain text.
- Code blocks (`#+begin_src ... #+end_src`) as actual blocks with a
  monospace font and subtle background, not inline `~code~` styling.
- LaTeX fragments (`$...$`, `\[...\]`) via KaTeX — the old project had this;
  we don't yet.
- Images (`[[file:...]]`) — blocked on the file-link resolver pipeline
  (org-attach/org-download detection) described in the architecture plan,
  which is still unimplemented; showing a "can't resolve" placeholder is a
  reasonable interim step over silently rendering nothing.

## Phase 5 — Motion & micro-interactions

- Selection/hover color and size changes are currently instant (a single
  `sigma.refresh()`); a short eased transition (Sigma supports animating
  node attributes) would make hover/select feel considerably less abrupt.
- Panel open/close (NotePane sliding in, FilterPanel/ThemePicker dropdowns)
  are instant show/hide; a fast (150-200ms) slide/fade would match the
  "smooth" bar set for the camera fix elsewhere in the app.
- Local-graph-widget focus changes (re-layout on new focus node) currently
  snap; animating node positions between layouts would read as far more
  polished for very little code (`graphology-layout`'s outputs can be
  tweened manually or via a small easing helper shared with
  CameraController's existing tween math).

## Phase 6 — Iconography & branding

- Currently zero icons anywhere — view-switcher tabs, filter/search/theme
  buttons are all text-only. A small icon set (Lucide or Heroicons, tree-
  shaken, SVG-in-JS so it themes via `currentColor`) would cut visual noise
  in the top bar and local-graph-widget header.
- No app icon/wordmark treatment beyond the plain text "org-ascipio" label —
  worth a minimal logomark once the rest of the visual language settles
  (deliberately last: a logo before the design language exists tends to get
  redone anyway).

## Sequencing note

Phases are listed in priority order but not meant to gate each other
strictly — Phase 1 (node color-coding) is implemented alongside this
document since it's the single highest-leverage change (the graph is the
app's main surface). Phases 2-6 are scoped and ready to pick up
independently; none of them require re-touching the theming foundation,
which is now considered stable infrastructure, not a work-in-progress.
