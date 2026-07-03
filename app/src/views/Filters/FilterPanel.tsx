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
        className="rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur hover:bg-black/80"
      >
        Filters{activeCount > 0 ? ` (${activeCount})` : ''}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-64 rounded-lg border border-white/10 bg-black/90 p-3 text-xs text-white backdrop-blur">
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
              <div className="mb-1 mt-2 text-white/50">
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
                            ? 'bg-rose-500/30 text-rose-200 line-through'
                            : 'bg-white/10 text-white/70 hover:bg-white/20')
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
              className="mt-2 w-full rounded bg-white/10 px-2 py-1 text-center hover:bg-white/20"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  )
}
