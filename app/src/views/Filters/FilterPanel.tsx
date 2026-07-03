import { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { FilterControls } from './FilterControls'

/**
 * Quick-access dropdown wrapper around FilterControls -- the same controls
 * are also available in the Settings panel's Filters tab for a more
 * spacious, discoverable view.
 */
export function FilterPanel() {
  const [open, setOpen] = useState(false)
  const filters = useAppStore((state) => state.filters)

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
        <div className="ascipio-panel-solid absolute right-0 top-full z-10 mt-1 w-64 rounded-lg p-3 backdrop-blur">
          <FilterControls />
        </div>
      )}
    </div>
  )
}
