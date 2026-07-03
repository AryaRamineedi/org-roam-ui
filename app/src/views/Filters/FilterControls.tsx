import { useMemo } from 'react'
import { graph } from '../../graph/graphData'
import { useAppStore } from '../../store/appStore'

function allTags(): string[] {
  const tags = new Set<string>()
  graph.forEachNode((_, attrs) => {
    ;(attrs.tags as string[] | undefined)?.forEach((tag) => tags.add(tag))
  })
  return Array.from(tags).sort()
}

/** The actual filter controls, shared between the quick TopBar dropdown
 *  (FilterPanel.tsx) and the Settings panel's Filters tab. */
export function FilterControls() {
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
    <div className="text-xs">
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
          <div className="ascipio-muted mb-1 mt-2">Click to require a tag, shift-click to exclude it</div>
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
                      ? 'bg-[var(--ascipio-accent-primary)] text-[var(--ascipio-bg)]'
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
          onClick={() => setFilters({ includedTags: [], excludedTags: [], hideOrphans: false, hideDoneTodos: false })}
          className="ascipio-chip ascipio-chip-hover mt-2 w-full rounded px-2 py-1 text-center"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
