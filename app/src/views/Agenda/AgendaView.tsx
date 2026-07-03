import { useMemo } from 'react'
import { graph } from '../../graph/graphData'
import { GraphNode } from '../../protocol/schema'
import { useAppStore } from '../../store/appStore'

const DONE_STATES = new Set(['DONE', 'CANCELLED', 'CANCELED'])

function earliestDate(node: GraphNode): string {
  return node.deadline ?? node.scheduled ?? '9999'
}

function groupByTodoState(nodes: GraphNode[]): Map<string, GraphNode[]> {
  const groups = new Map<string, GraphNode[]>()
  for (const node of nodes) {
    if (!node.todo) continue
    const list = groups.get(node.todo) ?? []
    list.push(node)
    groups.set(node.todo, list)
  }
  for (const list of groups.values()) {
    list.sort((a, b) => earliestDate(a).localeCompare(earliestDate(b)))
  }
  // Not-done states first (so DONE/CANCELLED columns end up on the right).
  return new Map(
    Array.from(groups.entries()).sort(([a], [b]) => {
      const aDone = DONE_STATES.has(a) ? 1 : 0
      const bDone = DONE_STATES.has(b) ? 1 : 0
      return aDone - bDone || a.localeCompare(b)
    }),
  )
}

/**
 * Task/agenda view: every node carrying a TODO state (from either the graph
 * payload's precomputed todo/priority/scheduled/deadline fields -- no extra
 * backend round-trip needed), grouped into Kanban-style columns by state
 * and sorted by deadline/scheduled date. Covers the "task management" use
 * case the graph view alone doesn't serve well.
 */
export function AgendaView() {
  const graphVersion = useAppStore((state) => state.graphVersion)
  const setSelectedNodeId = useAppStore((state) => state.setSelectedNodeId)
  const setActiveNodeId = useAppStore((state) => state.setActiveNodeId)
  const setViewMode = useAppStore((state) => state.setViewMode)
  const sendCommand = useAppStore((state) => state.sendCommand)

  const groups = useMemo(() => {
    const nodes = graph.mapNodes((_, attrs) => attrs as unknown as GraphNode)
    return groupByTodoState(nodes)
  }, [graphVersion])

  const openInGraph = (id: string) => {
    setSelectedNodeId(id)
    setActiveNodeId(id)
    setViewMode('graph')
  }

  if (groups.size === 0) {
    return (
      <div className="ascipio-muted flex h-full w-full items-center justify-center">
        No TODO items found in this vault.
      </div>
    )
  }

  return (
    <div className="flex h-full w-full gap-3 overflow-x-auto p-4">
      {Array.from(groups.entries()).map(([state, nodes]) => (
        <div key={state} className="ascipio-chip flex w-64 shrink-0 flex-col rounded-lg">
          <div className="ascipio-muted border-b border-[var(--ascipio-border)] px-3 py-2 text-xs font-semibold uppercase tracking-wide">
            {state} ({nodes.length})
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-2">
            {nodes.map((node) => (
              <div key={node.id} className="ascipio-panel-solid rounded-md p-2 text-xs">
                <button onClick={() => openInGraph(node.id)} className="block w-full text-left font-medium hover:underline">
                  {node.priority ? `[#${node.priority}] ` : ''}
                  {node.title}
                </button>
                <div className="ascipio-muted mt-1 flex flex-wrap gap-1">
                  {node.deadline && (
                    <span className="rounded bg-[var(--ascipio-accent-red)]/20 px-1 py-0.5 text-[var(--ascipio-accent-red)]">
                      due {node.deadline.slice(0, 10)}
                    </span>
                  )}
                  {node.scheduled && !node.deadline && (
                    <span className="ascipio-chip rounded px-1 py-0.5">{node.scheduled.slice(0, 10)}</span>
                  )}
                  {node.tags.map((tag) => (
                    <span key={tag} className="ascipio-chip rounded px-1 py-0.5">
                      #{tag}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => sendCommand?.({ command: 'open', data: { id: node.id } })}
                  disabled={!sendCommand}
                  className="mt-1.5 text-[var(--ascipio-accent-blue)] hover:underline disabled:opacity-40"
                >
                  Open in Emacs
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
