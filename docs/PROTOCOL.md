# org-ascipio wire protocol (v1)

This is the authoritative contract between the Emacs backend
(`org-ascipio-server.el`, `org-ascipio-db.el`) and the frontend
(`app/src/protocol/`). The two are not code-generated from a shared source —
the Elisp side is written by hand against this document, and the TypeScript
side is enforced at runtime by the zod schemas in `app/src/protocol/schema.ts`
and `app/src/protocol/messages.ts`. **Keep this file in sync with both by
hand whenever the protocol changes.**

Forward compatibility rule: every message carries a `v` (version) field, and
both sides drop/ignore messages or fields they don't recognize rather than
crashing. This lets the two halves evolve somewhat independently over time —
see the "Flexibility & extensibility" principles in the architecture plan.

## Transports

- **WebSocket**, `ws://127.0.0.1:35903` by default (`org-ascipio-ws-port`).
  All structured, live, bidirectional data: graph state, commands.
- **HTTP**, `http://127.0.0.1:35901` by default (`org-ascipio-http-port`).
  Serves the static frontend build (`org-ascipio-dist-dir`) for the browser
  and xwidget-webkit run modes, plus `GET /health` (returns `200 ok`).
  `GET /node/:id` (raw org text) and a consolidated `GET /file` (pluggable
  image/file link resolution) are planned for the note-content rendering
  phase — not implemented yet.

Both servers are local-only and unauthenticated, matching the old
org-roam-ui's threat model: they bind to localhost and assume anything that
can reach them is trusted (the same machine/user).

## Envelope

Server → client messages: `{ "v": 1, "type": "<type>", "data": <payload> }`.
Client → server messages: `{ "command": "<command>", "data": <payload> }`.

## Server → client message types

| `type` | `data` shape | Status |
|---|---|---|
| `graph:init` | `GraphSnapshot` | Implemented. Sent once per client on connect, and again (full resend) after every `after-save-hook` on an org-roam buffer. |
| `graph:patch` | `GraphPatch` | Schema defined, not yet sent — diffed updates are a documented fast-follow (`org-ascipio-diff.el`, not yet written) replacing the current full-resend-on-save behavior. |
| `variables` | `EmacsVariables` | Schema defined, not yet sent. |
| `theme` | `ThemeTokens` | Schema defined, not yet sent — theme auto-sync is a later phase (`org-ascipio-theme.el`, not yet written). |
| `command` | `{ commandName: 'follow' \| 'local' \| 'zoom', id: string, ... }` | `follow` is implemented (`org-ascipio-follow.el`); `local`/`zoom` schemas are defined but not yet sent by anything. |
| `error` | `{ message: string }` | Schema defined, reserved for future use. |

### `GraphSnapshot`

```ts
interface GraphNode {
  id: string
  file: string
  title: string
  level: number
  pos: number
  olp: string[] | null
  tags: string[]
  properties: Record<string, string>
  todo: string | null
  priority: string | null
  scheduled: string | null   // as stored by org-roam's `scheduled` column; not normalized yet
  deadline: string | null
  backlinks: string[]        // node ids linking to this node; precomputed server-side
}
type LinkType = 'id' | 'cite' | 'ref' | 'parent' | 'heading'
interface GraphLink { source: string; target: string; type: LinkType }
interface GraphSnapshot { nodes: GraphNode[]; links: GraphLink[]; tags: string[] }
```

Note: only `id`-type links are populated by `org-ascipio-db.el` today.
Citation/reference link support (`cite`/`ref`, requiring org-roam-bibtex
integration) and client-synthesized `parent`/`heading` links are schema'd
for forward compatibility but not implemented — a documented gap, not an
oversight.

## Client → server commands

| `command` | `data` shape | Status |
|---|---|---|
| `open` | `{ id: string }` | Implemented — opens the node in Emacs, splitting the window. |
| `delete` | `{ id: string; file: string }` | Implemented — deletes the file, resyncs the org-roam DB, and broadcasts a fresh `graph:init`. |
| `create` | `{ title: string; ref?: string }` | Implemented (title-only; `ref`/org-roam-bibtex integration not yet ported). |

## Extending the protocol

- Adding a field: add it to the zod schema as `.optional()` first, add the
  corresponding Elisp key, then tighten the schema once both sides ship it.
- Adding a message type: add a new variant to `ServerMessageSchema` /
  `ClientMessageSchema`'s discriminated union, document it in the table
  above, and implement the Elisp sender/handler. Because unknown types are
  dropped rather than throwing, this is safe to land frontend-first or
  backend-first.
