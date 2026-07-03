import { useState } from 'react'
import { graph } from '../../graph/graphData'
import { GraphNode } from '../../protocol/schema'
import { useAppStore } from '../../store/appStore'

/**
 * Client-side title/tag search over the already-loaded graph -- no server
 * round-trip needed since the whole node set is resident in the browser.
 * Typing dims non-matches in the graph (via graphReducers.ts); Enter or
 * clicking a result selects + re-centers the camera on the first match.
 */
export function SearchBox() {
  const searchQuery = useAppStore((state) => state.searchQuery)
  const setSearchQuery = useAppStore((state) => state.setSearchQuery)
  const setSelectedNodeId = useAppStore((state) => state.setSelectedNodeId)
  const setActiveNodeId = useAppStore((state) => state.setActiveNodeId)
  const [focused, setFocused] = useState(false)

  const query = searchQuery.trim().toLowerCase()
  const results: Array<{ id: string; node: GraphNode }> =
    query.length === 0
      ? []
      : graph
          .mapNodes((id, attrs) => ({ id, node: attrs as unknown as GraphNode }))
          .filter(({ node }) => `${node.title} ${node.tags.join(' ')}`.toLowerCase().includes(query))
          .slice(0, 20)

  const goTo = (id: string) => {
    setSelectedNodeId(id)
    setActiveNodeId(id)
    setSearchQuery('')
    setFocused(false)
  }

  return (
    <div className="pointer-events-auto relative w-64">
      <input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results.length > 0) goTo(results[0].id)
          if (e.key === 'Escape') setSearchQuery('')
        }}
        placeholder="Search notes and tags…"
        className="ascipio-panel w-full rounded-lg px-3 py-1.5 text-xs backdrop-blur placeholder:opacity-50 focus:outline-none focus:ring-1 focus:ring-[var(--ascipio-accent-blue)]"
      />
      {focused && results.length > 0 && (
        <div className="ascipio-panel-solid absolute left-0 top-full z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg text-xs backdrop-blur">
          {results.map(({ id, node }) => (
            <button
              key={id}
              onMouseDown={() => goTo(id)}
              className="ascipio-chip-hover block w-full truncate px-3 py-1.5 text-left"
            >
              {node.title}
              {node.tags.length > 0 && (
                <span className="ascipio-muted ml-1.5">{node.tags.map((t) => `#${t}`).join(' ')}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
