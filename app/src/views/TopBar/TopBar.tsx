import { useAppStore } from '../../store/appStore'
import { SearchBox } from '../Search/SearchBox'
import { FilterPanel } from '../Filters/FilterPanel'
import { runtime } from '../../runtime/capabilities'

const STATUS_LABEL: Record<string, string> = {
  connecting: 'Connecting to Emacs…',
  open: 'Connected to Emacs',
  reconnecting: 'Reconnecting…',
  closed: 'Disconnected',
}

export function TopBar() {
  const status = useAppStore((state) => state.connectionStatus)
  const viewMode = useAppStore((state) => state.viewMode)
  const setViewMode = useAppStore((state) => state.setViewMode)

  return (
    <div className="pointer-events-auto flex items-center gap-2">
      <div className="rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur">
        org-ascipio — {STATUS_LABEL[status] ?? status}
        {runtime.isTauri && <span className="ml-2 text-white/50">(standalone)</span>}
      </div>

      <div className="flex overflow-hidden rounded-lg border border-white/10 bg-black/60 text-xs text-white backdrop-blur">
        {(['graph', 'agenda'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`px-3 py-1.5 capitalize ${viewMode === mode ? 'bg-white/20' : 'hover:bg-white/10'}`}
          >
            {mode}
          </button>
        ))}
      </div>

      <SearchBox />
      <FilterPanel />
    </div>
  )
}
