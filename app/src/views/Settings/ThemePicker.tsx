import { useState } from 'react'
import { applyTheme } from '../../theme/applyTheme'
import { THEME_PRESETS } from '../../theme/presets'
import { useAppStore } from '../../store/appStore'

const PRESET_LABELS: Record<string, string> = {
  midnight: 'Midnight (default)',
  nord: 'Nord',
  'solarized-dark': 'Solarized Dark',
  'solarized-light': 'Solarized Light',
  gruvbox: 'Gruvbox',
  'rose-pine': 'Rosé Pine',
}

/**
 * Manual theme override: picking a preset applies it immediately through
 * the exact same pipeline a live Emacs theme push uses (theme/applyTheme.ts)
 * -- there's no separate "preset mode" vs "synced mode", just whichever
 * ThemeTokens object was applied most recently. If Emacs pushes a theme
 * afterwards (on connect, or on the next `enable-theme-functions` fire) it
 * simply overrides the manual pick, which is the expected behavior.
 */
export function ThemePicker() {
  const [open, setOpen] = useState(false)
  const setTheme = useAppStore((state) => state.setTheme)
  const connectionStatus = useAppStore((state) => state.connectionStatus)

  const pick = (id: string) => {
    const tokens = THEME_PRESETS[id]
    applyTheme(tokens)
    setTheme(tokens)
    setOpen(false)
  }

  return (
    <div className="pointer-events-auto relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="ascipio-panel ascipio-chip-hover rounded-lg px-3 py-1.5 text-xs backdrop-blur"
      >
        Theme
      </button>
      {open && (
        <div className="ascipio-panel-solid absolute right-0 top-full z-10 mt-1 w-48 rounded-lg p-1 text-xs backdrop-blur">
          {connectionStatus === 'open' && (
            <div className="ascipio-muted px-2 py-1">Synced live from Emacs — pick a preset to override</div>
          )}
          {Object.keys(THEME_PRESETS).map((id) => (
            <button
              key={id}
              onClick={() => pick(id)}
              className="ascipio-chip-hover block w-full rounded px-2 py-1 text-left"
            >
              {PRESET_LABELS[id] ?? id}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
