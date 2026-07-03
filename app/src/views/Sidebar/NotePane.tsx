import { useEffect, useMemo, useState } from 'react'
import { graph } from '../../graph/graphData'
import { GraphNode } from '../../protocol/schema'
import { fetchNodeText } from '../../org/fetchNodeText'
import { renderOrgText } from '../../org/renderOrgText'
import { useAppStore } from '../../store/appStore'

function getNode(id: string): GraphNode | null {
  if (!graph.hasNode(id)) return null
  return graph.getNodeAttributes(id) as unknown as GraphNode
}

function titleOf(id: string): string {
  return getNode(id)?.title ?? id
}

/**
 * Note-preview sidebar: metadata (tags, TODO/priority/scheduled/deadline),
 * the node's raw org text (org/renderOrgText.tsx), backlinks and forward
 * links (both clickable, both navigate + re-center the camera), and an
 * "Open in Emacs" action. This is the core reading surface for the graph --
 * without it, clicking a node did nothing.
 */
export function NotePane() {
  const selectedNodeId = useAppStore((state) => state.selectedNodeId)
  const setSelectedNodeId = useAppStore((state) => state.setSelectedNodeId)
  const setActiveNodeId = useAppStore((state) => state.setActiveNodeId)
  const sendCommand = useAppStore((state) => state.sendCommand)
  const graphVersion = useAppStore((state) => state.graphVersion) // eslint-disable-line @typescript-eslint/no-unused-vars

  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const node = selectedNodeId ? getNode(selectedNodeId) : null
  const forwardLinkIds = useMemo(
    () => (selectedNodeId && graph.hasNode(selectedNodeId) ? graph.outNeighbors(selectedNodeId) : []),
    [selectedNodeId, graphVersion],
  )

  useEffect(() => {
    setText(null)
    setError(null)
    if (!selectedNodeId) return
    let cancelled = false
    fetchNodeText(selectedNodeId)
      .then((body) => {
        if (!cancelled) setText(body)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load note content from Emacs.')
      })
    return () => {
      cancelled = true
    }
  }, [selectedNodeId])

  if (!selectedNodeId || !node) return null

  const navigateTo = (id: string) => {
    setSelectedNodeId(id)
    setActiveNodeId(id)
  }

  return (
    <div className="pointer-events-auto flex h-full w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-black/80 text-sm text-white backdrop-blur">
      <div className="flex items-start justify-between gap-2 border-b border-white/10 p-3">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold">{node.title}</div>
          <div className="truncate text-xs text-white/50">{node.file}</div>
        </div>
        <button
          onClick={() => setSelectedNodeId(null)}
          className="shrink-0 rounded px-1.5 py-0.5 text-white/60 hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-white/10 p-2 text-xs">
        {node.todo && (
          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-medium text-amber-300">
            {node.todo}
            {node.priority ? ` [#${node.priority}]` : ''}
          </span>
        )}
        {node.scheduled && (
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-white/70">
            scheduled {node.scheduled.slice(0, 10)}
          </span>
        )}
        {node.deadline && (
          <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-rose-300">
            deadline {node.deadline.slice(0, 10)}
          </span>
        )}
        {node.tags.map((tag) => (
          <span key={tag} className="rounded bg-white/10 px-1.5 py-0.5 text-white/70">
            #{tag}
          </span>
        ))}
        <button
          onClick={() => sendCommand?.({ command: 'open', data: { id: node.id } })}
          disabled={!sendCommand}
          className="ml-auto rounded bg-[var(--ascipio-accent-blue)] px-2 py-0.5 font-medium text-white disabled:opacity-40"
        >
          Open in Emacs
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {error && <div className="text-rose-300">{error}</div>}
        {!error && text === null && <div className="text-white/50">Loading…</div>}
        {!error &&
          text !== null &&
          renderOrgText(text, {
            onNavigateToId: navigateTo,
            resolveTitle: titleOf,
          })}
      </div>

      {forwardLinkIds.length > 0 && (
        <LinkSection title="Links" ids={forwardLinkIds} onNavigate={navigateTo} />
      )}
      {node.backlinks.length > 0 && (
        <LinkSection title="Backlinks" ids={node.backlinks} onNavigate={navigateTo} />
      )}
    </div>
  )
}

function LinkSection({
  title,
  ids,
  onNavigate,
}: {
  title: string
  ids: string[]
  onNavigate: (id: string) => void
}) {
  return (
    <div className="max-h-32 shrink-0 overflow-y-auto border-t border-white/10 p-2">
      <div className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-white/40">
        {title} ({ids.length})
      </div>
      {ids.map((id) => (
        <button
          key={id}
          onClick={() => onNavigate(id)}
          className="block w-full truncate rounded px-1 py-0.5 text-left text-white/80 hover:bg-white/10"
        >
          {titleOf(id)}
        </button>
      ))}
    </div>
  )
}
