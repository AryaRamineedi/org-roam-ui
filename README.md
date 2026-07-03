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

Early skeleton. What works right now: the Emacs backend pushes live
org-roam graph data (including TODO/priority/scheduled/deadline and
precomputed backlinks) over a websocket, and the frontend renders it as a
WebGL graph with a camera controller that fixes the old project's
"infinite zoom" follow-mode bug. Task/agenda views, live theme sync, the
local-graph mini-panel, note-content rendering, and search are designed but
not yet built — see `docs/PROTOCOL.md` for what's implemented vs. planned,
and the project's architecture plan for the full roadmap.

## Running it

### 1. Emacs backend (required for all three modes)

Add this repository to your `load-path` (or install it via `straight.el` /
`package-vc-install` once published), then:

```elisp
(require 'org-ascipio)
(setq org-roam-directory "~/path/to/your/org-roam-vault")
(org-ascipio-mode 1)
```

This starts an HTTP server on `localhost:35901` (serving the committed
`dist/` build) and a websocket server on `localhost:35903` (live graph
data). By default it also opens your browser to the app
(`org-ascipio-open-on-start`).

### 2a. Browser / xwidget-webkit

With `org-ascipio-mode` enabled, either open `http://localhost:35901` in any
browser, or run `M-x org-ascipio-open` (customize
`org-ascipio-browser-function` to `xwidget-webkit-browse-url` to embed it in
an Emacs buffer on xwidget-enabled builds).

### 2b. Standalone (Tauri)

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
org-ascipio.el, org-ascipio-*.el   Emacs package (entrypoint, server, DB queries, follow-mode)
dist/                               Committed production frontend build (served by Emacs + Tauri)
app/                                 Frontend source (Vite + React + TS + Sigma.js) — builds into dist/
src-tauri/                           Standalone desktop shell (Tauri)
docs/PROTOCOL.md                    Authoritative Emacs <-> frontend wire protocol
legacy/                              The original org-roam-ui project, kept as reference only
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
