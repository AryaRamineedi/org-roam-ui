import { useAppStore } from '../../store/appStore'
import { ColorMode } from '../../graph/nodeColor'

const MODES: { id: ColorMode; label: string }[] = [
  { id: 'tag', label: 'Tag' },
  { id: 'todo', label: 'TODO' },
  { id: 'plain', label: 'Plain' },
]

/** Switches how nodes are colored -- see docs/VISUAL_ROADMAP.md Phase 1. */
export function ColorModeToggle() {
  const colorMode = useAppStore((state) => state.colorMode)
  const setColorMode = useAppStore((state) => state.setColorMode)

  return (
    <div className="ascipio-panel pointer-events-auto flex overflow-hidden rounded-lg text-xs backdrop-blur">
      {MODES.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => setColorMode(id)}
          className={`ascipio-chip-hover px-2.5 py-1.5 ${colorMode === id ? 'ascipio-chip' : ''}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
