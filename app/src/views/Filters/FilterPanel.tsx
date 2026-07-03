import { useMemo, useState } from 'react'
import { graph } from '../../graph/graphData'
import { useAppStore } from '../../store/appStore'

function allTags(): string[] {
  const tags = new Set<string>()
  graph.forEachNode((_, attrs) => {
    ;(attrs.tags as string[] | undefined)?.forEach((tag) => tags.add(tag))
  })
  return Array.from(tags).sort()
}

/**
 * Tag include/exclude toggles plus orphan/done-todo hiding, applied via
 * Sigma's node/edge reducers (graph/graphReducers.ts) rather than mutating
 * the underlying graphology graph -- so filters are instant and reversible.
 */
export function FilterPanel() {
  const [open, setOpen] = useState(false)
  const filters = useAppStore((state) => state.filters)
  const setFilters = useAppStore((state) => state.setFilters)
  const graphVersion = useAppStore((state) => state.graphVersion)
  const tags = useMemo(() => allTags(), [graphVersion])

  const toggleTag = (tag: string, list: 'includedTags' | 'excludedTags') => {
    const current = filters[list]
    const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]
    setFilters({ [list]: next })
  }

  const activeCount =
    filters.includedTags.length +
    filters.excludedTags.length +
    (filters.hideOrphans ? 1 : 0) +
    (filters.hideDoneTodos ? 1 : 0)

  return (
    <div className="pointer-events-auto relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="ascipio-panel ascipio-chip-hover rounded-lg px-3 py-1.5 text-xs backdrop-blur"
      >
        Filters{activeCount > 0 ? ` (${activeCount})` : ''}
      </button>
      {open && (
        <div className="ascipio-panel-solid absolute right-0 top-full z-10 mt-1 w-64 rounded-lg p-3 text-xs backdrop-blur">
          <label className="mb-1.5 flex items-center gap-2">
            <input
              type="checkbox"
              checked={filters.hideOrphans}
              onChange={(e) => setFilters({ hideOrphans: e.target.checked })}
            />
            Hide orphan notes
          </label>
          <label className="mb-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={filters.hideDoneTodos}
              onChange={(e) => setFilters({ hideDoneTodos: e.target.checked })}
            />
            Hide completed TODOs
          </label>

          {tags.length > 0 && (
            <>
              <div className="ascipio-muted mb-1 mt-2">
                Click to require a tag, shift-click to exclude it
              </div>
              <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
                {tags.map((tag) => {
                  const included = filters.includedTags.includes(tag)
                  const excluded = filters.excludedTags.includes(tag)
                  return (
                    <button
                      key={tag}
                      onClick={(e) => toggleTag(tag, e.shiftKey ? 'excludedTags' : 'includedTags')}
                      className={
                        'rounded px-1.5 py-0.5 ' +
                        (included
                          ? 'bg-[var(--ascipio-accent-blue)] text-white'
                          : excluded
                            ? 'bg-[var(--ascipio-accent-red)]/30 line-through'
                            : 'ascipio-chip ascipio-chip-hover')
                      }
                    >
                      #{tag}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {activeCount > 0 && (
            <button
              onClick={() =>
                setFilters({ includedTags: [], excludedTags: [], hideOrphans: false, hideDoneTodos: false })
              }
              className="ascipio-chip ascipio-chip-hover mt-2 w-full rounded px-2 py-1 text-center"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}
