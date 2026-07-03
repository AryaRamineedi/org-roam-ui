# org-ascipio

A modern, extensible graph UI and second-brain app for
[org-roam](https://www.orgroam.com/) — a ground-up rewrite of
[org-roam-ui](https://github.com/org-roam/org-roam-ui) (kept in this repo
under [`legacy/`](legacy/) as reference only; org-ascipio does not build on
top of it and shares no code with it).

org-ascipio installs like any other Emacs package: the frontend's production
build ships committed in [`dist/`](dist/), so `M-x package-install`-style
setup (`straight.el`, `package-vc-install`, MELPA, or a manual `git clone` +
`load-path`) needs nothing but Emacs — no Node, no pnpm, no build step.

It runs three ways from the same build:

1. **Inside an Emacs xwidget-webkit buffer** (Doom Emacs or any Emacs build
   with xwidget support) — best-effort for now, no dedicated buffer chrome
   yet.
2. **In an external browser** (Firefox, etc.) — `M-x org-ascipio-open`.
3. **As a standalone desktop app**, via the [Tauri](https://tauri.app) shell
   in [`src-tauri/`](src-tauri/).

## Status

The core app is functional: the Emacs backend pushes live org-roam graph
data (including TODO/priority/scheduled/deadline and precomputed backlinks)
over a websocket, and the frontend renders it as a WebGL graph with a
camera controller that fixes the old project's "infinite zoom"
follow-mode bug. On top of that:

- **Click a node** to select it (double-click sends `open`, jumping to it
  in Emacs); hovering highlights its neighborhood.
- **Note-preview sidebar**: the node's raw org content (headings, links,
  bold/italic/code — a lightweight renderer, not the full org-mode pipeline
  yet), tags, TODO/priority/scheduled/deadline, and clickable
  backlinks/forward-links, with an "Open in Emacs" button.
- **Local-graph corner widget**: an Obsidian-style always-visible mini view
  of the focused node's immediate neighborhood, independent of the main
  graph's pan/zoom.
- **Agenda view**: every node carrying a TODO state, grouped into
  Kanban-style columns by state and sorted by deadline/scheduled date —
  no backend changes needed, since the graph payload already carries this.
- **Search**: client-side title/tag search with live graph highlighting.
- **Filters**: tag include/exclude, hide-orphans, hide-completed-TODOs,
  applied live via Sigma's node/edge reducers.

Not yet built: diffed (rather than full-resend) graph updates, live Emacs
theme sync, citation/reference links, and the pluggable file/image link
resolver — see `docs/PROTOCOL.md` for the wire-protocol-level detail on
what's implemented vs. planned. Visual/theming polish is the next major
phase (see the visual roadmap once it lands).

## Running it

### 1. Emacs backend (required for all three modes)

org-ascipio is a single file, `org-ascipio.el`, with no build step — every
install method below just needs Emacs to load it.

#### Doom Emacs

Make sure the `org` module's `+roam2` flag is enabled in `init.el` (org-ascipio
depends on `org-roam`, which Doom already manages):

```elisp
;; init.el
(org +roam2)
```

Add the package in `packages.el` (`~/.doom.d/packages.el` or
`~/.config/doom/packages.el`):

```elisp
;; packages.el
(package! org-ascipio
  :recipe (:host github
           :repo "AryaRamineedi/org-roam-ui"
           :branch "claude/org-ascipio-ui-redesign-oqnlvp" ; drop this line once merged to main
           :files (:defaults "dist")))
```

`:files (:defaults "dist")` tells straight.el (which Doom uses under the
hood) to pull in `org-ascipio.el` plus the committed `dist/` build, and skip
the unrelated `app/`, `src-tauri/`, and `legacy/` directories in this repo.

Then configure it in `config.el` (`~/.doom.d/config.el` or
`~/.config/doom/config.el`):

```elisp
;; config.el
(use-package! org-ascipio
  :after org-roam
  :config
  ;; Only needed if org-roam-directory isn't already set elsewhere.
  ;; (setq org-roam-directory "~/path/to/your/org-roam-vault")

  ;; Optional: embed org-ascipio in an Emacs buffer instead of opening an
  ;; external browser, on Emacs builds compiled with xwidget support
  ;; (best-effort for now, see "Inside Doom via xwidget-webkit" below):
  ;; (setq org-ascipio-browser-function #'xwidget-webkit-browse-url)
  )

;; Optional leader keybindings
(map! :leader
      :desc "Toggle org-ascipio" "n r u" #'org-ascipio-mode
      :desc "Open org-ascipio"   "n r U" #'org-ascipio-open)
```

Run `doom sync` (or `doom sync -u` the first time), restart/reload Doom, then
`M-x org-ascipio-mode`.

#### Other Emacs (straight.el, `package-vc-install`, or manual)

```elisp
;; straight.el, without use-package
(straight-use-package
 '(org-ascipio :type git :host github :repo "AryaRamineedi/org-roam-ui"
               :branch "claude/org-ascipio-ui-redesign-oqnlvp"
               :files (:defaults "dist")))

;; or, Emacs 29+'s built-in package-vc.el
;; M-x package-vc-install RET https://github.com/AryaRamineedi/org-roam-ui RET

;; or, manually
;; git clone https://github.com/AryaRamineedi/org-roam-ui ~/.emacs.d/site-lisp/org-ascipio
;; (add-to-list 'load-path "~/.emacs.d/site-lisp/org-ascipio")
```

Then, regardless of install method:

```elisp
(require 'org-ascipio)
(setq org-roam-directory "~/path/to/your/org-roam-vault")
(org-ascipio-mode 1)
```

This starts an HTTP server on `localhost:35901` (serving the committed
`dist/` build) and a websocket server on `localhost:35903` (live graph
data). By default it also opens your browser to the app
(`org-ascipio-open-on-start`).

### 2a. Browser

With `org-ascipio-mode` enabled, either open `http://localhost:35901` in any
browser (Firefox, etc.), or run `M-x org-ascipio-open`.

### 2b. Inside Doom via xwidget-webkit

Requires an Emacs build compiled with xwidget support (`emacs --version`
won't show this directly; check with `(featurep 'xwidget-internal)` — Doom
itself doesn't require xwidget, it depends on how your Emacs binary was
built/packaged). If available:

```elisp
;; config.el
(after! org-ascipio
  (setq org-ascipio-browser-function #'xwidget-webkit-browse-url))
```

Then `M-x org-ascipio-open` embeds the app in an Emacs buffer instead of an
external browser. This is best-effort for now — there's no dedicated
xwidget buffer chrome/keybindings yet, and xwidget-webkit's bundled WebKit
can lag behind a real browser in feature support.

### 2c. Standalone (Tauri)

```sh
cd src-tauri
cargo tauri dev   # or: cargo tauri build, for a release binary
```

The Tauri window loads the same `../dist` build and connects to the same
`ws://127.0.0.1:35903` — Emacs (`org-ascipio-mode`) must still be running.
Tauri never embeds or spawns Emacs itself.

> Building the Tauri shell requires the normal
> [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) (Rust,
> and on Linux, WebKitGTK + GTK3 dev packages) — it hasn't been
> compile-verified in this repository's CI sandbox, which lacks those system
> libraries.

## Developing the frontend

The frontend lives in [`app/`](app/) (Vite + React + TypeScript + Sigma.js).
End users never need to touch this — only maintainers rebuilding `dist/`:

```sh
cd app
npm install
npm run dev          # local dev server at http://localhost:5173, connects to ws://127.0.0.1:35903
npm test              # vitest — includes a regression test for the old zoom bug (CameraController)
npm run build:dist    # type-checks and rebuilds the committed ../dist
```

While running `npm run dev` without a live Emacs connection, use the
in-app **"Load demo graph"** button to load synthetic data, and the
**camera fix demo** panel (bottom-right) to fire a burst of rapid synthetic
`follow` events and confirm the camera settles smoothly with no runaway
zoom.

## Repository layout

```
org-ascipio.el       The entire Emacs package: entrypoint, HTTP+websocket server, DB queries, follow-mode
dist/                 Committed production frontend build (served by Emacs + Tauri)
app/                   Frontend source (Vite + React + TS + Sigma.js) — builds into dist/
src-tauri/             Standalone desktop shell (Tauri)
docs/PROTOCOL.md      Authoritative Emacs <-> frontend wire protocol
legacy/                The original org-roam-ui project, kept as reference only
```

## Why this exists

org-roam-ui's UI is dated and its "follow on zoom" camera feature is
actually broken — rapid cursor movement in Emacs could trigger runaway/
infinite zoom (see `CameraController.ts`'s doc comment for the confirmed
root cause and the fix). org-ascipio is a full redesign, not a fork: a
modern WebGL graph view aiming to be genuinely competitive with tools like
Obsidian, plus features org-roam-ui never had — task/agenda views, a
local-graph corner widget, live full-vault theme sync from any Emacs theme,
and a pluggable file/image link resolver that auto-detects `org-attach`,
`org-download`, relative/absolute paths, and more.
