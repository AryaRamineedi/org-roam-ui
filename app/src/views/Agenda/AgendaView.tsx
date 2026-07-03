import { useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import { useAgendaStore } from '../../store/agendaStore'
import { AgendaLine } from '../../protocol/schema'

const DONE_STATES = new Set(['DONE', 'CANCELLED', 'CANCELED'])

function accentColorFor(line: AgendaLine): string {
  if (!line.todo) return 'transparent'
  if (DONE_STATES.has(line.todo)) return 'var(--ascipio-accent-green)'
  return 'var(--ascipio-accent-red)'
}

/**
 * The agenda view is a thin viewer over Emacs's own `org-agenda` -- see
 * org-ascipio.el's Agenda section and docs/PROTOCOL.md. There is no
 * client-side scheduling/matching logic here: the list of selectable
 * views is exactly the user's own `org-agenda-custom-commands` (plus the
 * two built-ins, "a" and "t"), and each line is the literal text Emacs's
 * agenda buffer rendered, so this can never drift from what `M-x
 * org-agenda` itself would show. Deliberately does not work without a
 * live Emacs connection -- there is no synthetic/demo agenda data, since
 * a fake agenda would be exactly the kind of half-implemented feature
 * this view is designed to avoid.
 */
export function AgendaView() {
  const connectionStatus = useAppStore((state) => state.connectionStatus)
  const sendCommand = useAppStore((state) => state.sendCommand)
  const setSelectedNodeId = useAppStore((state) => state.setSelectedNodeId)
  const setActiveNodeId = useAppStore((state) => state.setActiveNodeId)

  const views = useAgendaStore((state) => state.views)
  const selectedKey = useAgendaStore((state) => state.selectedKey)
  const setSelectedKey = useAgendaStore((state) => state.setSelectedKey)
  const lines = useAgendaStore((state) => state.lines)
  const loading = useAgendaStore((state) => state.loading)
  const setLoading = useAgendaStore((state) => state.setLoading)

  // Auto-select the first available view once connected, if none chosen yet.
  useEffect(() => {
    if (!selectedKey && views.length > 0) setSelectedKey(views[0].key)
  }, [views, selectedKey, setSelectedKey])

  const runView = (key: string) => {
    setSelectedKey(key)
    setLoading(true)
    sendCommand?.({ command: 'agenda:run', data: { key } })
  }

  const openLine = (line: AgendaLine) => {
    if (line.isHeader) return
    if (line.id) {
      setSelectedNodeId(line.id)
      setActiveNodeId(line.id)
    }
    if (line.id || line.file) {
      sendCommand?.({
        command: 'open',
        data: { id: line.id ?? undefined, file: line.file ?? undefined, pos: line.pos ?? undefined },
      })
    }
  }

  if (connectionStatus !== 'open') {
    return (
      <div className="ascipio-muted flex h-full w-full flex-col items-center justify-center gap-2 text-center">
        <div className="text-sm">Agenda needs a live Emacs connection.</div>
        <div className="max-w-md text-xs">
          This view mirrors your real <code>org-agenda</code> exactly (including any custom views
          you've configured) rather than reimplementing scheduling logic — there's no offline demo
          for it.
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="ascipio-panel-solid flex shrink-0 items-center gap-1 border-b p-2">
        {views.length === 0 && <span className="ascipio-muted text-xs">No agenda views available.</span>}
        {views.map((view) => (
          <button
            key={view.key}
            onClick={() => runView(view.key)}
            className={`ascipio-chip-hover rounded px-2.5 py-1 text-xs ${selectedKey === view.key ? 'ascipio-chip' : ''}`}
          >
            {view.description}
          </button>
        ))}
        {loading && <span className="ascipio-muted ml-2 text-xs">Running…</span>}
      </div>

      <div className="flex-1 overflow-y-auto p-2 font-mono text-xs">
        {lines === null && !loading && (
          <div className="ascipio-muted p-4 text-center">Pick a view above to run it.</div>
        )}
        {lines?.map((line, i) =>
          line.isHeader ? (
            <div key={i} className="ascipio-muted mt-3 whitespace-pre px-2 py-1 first:mt-0">
              {line.text}
            </div>
          ) : (
            <button
              key={i}
              onClick={() => openLine(line)}
              className="ascipio-chip-hover flex w-full items-start gap-2 whitespace-pre rounded px-2 py-1 text-left"
              style={{ borderLeft: `2px solid ${accentColorFor(line)}` }}
            >
              {line.text}
            </button>
          ),
        )}
      </div>
    </div>
  )
}
