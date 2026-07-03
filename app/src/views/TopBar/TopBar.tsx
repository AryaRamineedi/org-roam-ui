import { useAppStore } from '../../store/appStore'
import { SearchBox } from '../Search/SearchBox'
import { FilterPanel } from '../Filters/FilterPanel'
import { ThemePicker } from '../Settings/ThemePicker'
import { ColorModeToggle } from '../Settings/ColorModeToggle'
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
      <div className="ascipio-panel rounded-lg px-3 py-1.5 text-xs backdrop-blur">
        org-ascipio — {STATUS_LABEL[status] ?? status}
        {runtime.isTauri && <span className="ascipio-muted ml-2">(standalone)</span>}
      </div>

      <div className="ascipio-panel flex overflow-hidden rounded-lg text-xs backdrop-blur">
        {(['graph', 'agenda'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`ascipio-chip-hover px-3 py-1.5 capitalize ${viewMode === mode ? 'ascipio-chip' : ''}`}
          >
            {mode}
          </button>
        ))}
      </div>

      <SearchBox />
      <ColorModeToggle />
      <FilterPanel />
      <ThemePicker />
    </div>
  )
}
