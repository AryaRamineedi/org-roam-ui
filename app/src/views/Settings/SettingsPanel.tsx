import { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useSettingsStore } from '../../store/settingsStore'
import { applyTheme } from '../../theme/applyTheme'
import { THEME_PRESETS } from '../../theme/presets'
import { FilterControls } from '../Filters/FilterControls'
import { Slider } from './Slider'
import { exportSettingsAsElisp } from './exportElisp'
import { ColorMode } from '../../graph/nodeColor'
import { DebugPanel } from '../../ui/DebugPanel'
import type { GraphCanvasHandle } from '../../graph/GraphCanvas'

const TABS = ['Physics', 'View', 'Filters', 'Appearance', 'Export', 'Diagnostics'] as const
type Tab = (typeof TABS)[number]

const PRESET_LABELS: Record<string, string> = {
  midnight: 'Midnight (default)',
  nord: 'Nord',
  'solarized-dark': 'Solarized Dark',
  'solarized-light': 'Solarized Light',
  gruvbox: 'Gruvbox',
  'rose-pine': 'Rosé Pine',
}

/**
 * The full configuration surface -- physics, view mode, filters,
 * appearance, and exporting the current settings as real Emacs Lisp (see
 * exportElisp.ts). The quick TopBar buttons (theme/color-mode/filters)
 * remain for fast access; this is the comprehensive one-stop version.
 */
export function SettingsPanel({
  onClose,
  graphHandle,
}: {
  onClose: () => void
  graphHandle: GraphCanvasHandle | null
}) {
  const [tab, setTab] = useState<Tab>('Physics')
  const physics = useSettingsStore((state) => state.physics)
  const setPhysics = useSettingsStore((state) => state.setPhysics)
  const resetPhysics = useSettingsStore((state) => state.resetPhysics)
  const graphViewMode = useSettingsStore((state) => state.graphViewMode)
  const setGraphViewMode = useSettingsStore((state) => state.setGraphViewMode)
  const localGraphWidgetEnabled = useSettingsStore((state) => state.localGraphWidgetEnabled)
  const setLocalGraphWidgetEnabled = useSettingsStore((state) => state.setLocalGraphWidgetEnabled)
  const setFocusMode = useSettingsStore((state) => state.setFocusMode)
  const lastEmacsDefaults = useSettingsStore((state) => state.lastEmacsDefaults)
  const resetToEmacsDefaults = useSettingsStore((state) => state.resetToEmacsDefaults)
  const colorMode = useAppStore((state) => state.colorMode)
  const setColorMode = useAppStore((state) => state.setColorMode)

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="ascipio-panel-solid flex h-[32rem] w-[42rem] max-w-full flex-col overflow-hidden rounded-xl">
        <div className="flex items-center justify-between border-b border-[var(--ascipio-border)] p-3">
          <div className="font-semibold">Settings</div>
          <button onClick={onClose} className="ascipio-chip-hover rounded px-1.5 py-0.5" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex w-36 shrink-0 flex-col border-r border-[var(--ascipio-border)] p-2 text-xs">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`ascipio-chip-hover mb-1 rounded px-2 py-1.5 text-left ${tab === t ? 'ascipio-chip-selected' : ''}`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 text-xs">
            {tab === 'Physics' && (
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={physics.enabled}
                    onChange={(e) => setPhysics({ enabled: e.target.checked })}
                  />
                  Live simulation (drag nodes, watch it settle)
                </label>
                <Slider
                  label="Repulsion (charge)"
                  value={physics.chargeStrength}
                  min={-400}
                  max={-10}
                  step={5}
                  onChange={(v) => setPhysics({ chargeStrength: v })}
                />
                <Slider
                  label="Link distance"
                  value={physics.linkDistance}
                  min={20}
                  max={300}
                  step={5}
                  onChange={(v) => setPhysics({ linkDistance: v })}
                />
                <Slider
                  label="Link strength"
                  value={physics.linkStrength}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => setPhysics({ linkStrength: v })}
                />
                <Slider
                  label="Centering (gravity)"
                  value={physics.centeringStrength}
                  min={0}
                  max={0.3}
                  step={0.01}
                  onChange={(v) => setPhysics({ centeringStrength: v })}
                />
                <Slider
                  label="Collision radius"
                  value={physics.collideRadius}
                  min={0}
                  max={40}
                  step={1}
                  onChange={(v) => setPhysics({ collideRadius: v })}
                />
                <Slider
                  label="Alpha decay (settle speed)"
                  value={physics.alphaDecay}
                  min={0.005}
                  max={0.1}
                  step={0.005}
                  onChange={(v) => setPhysics({ alphaDecay: v })}
                />
                <Slider
                  label="Velocity decay (friction)"
                  value={physics.velocityDecay}
                  min={0.05}
                  max={0.9}
                  step={0.05}
                  onChange={(v) => setPhysics({ velocityDecay: v })}
                />
                <button
                  onClick={resetPhysics}
                  className="ascipio-chip ascipio-chip-hover w-fit rounded px-2 py-1"
                >
                  Reset to app defaults
                </button>
              </div>
            )}

            {tab === 'View' && (
              <div className="flex flex-col gap-4">
                <div>
                  <div className="mb-1 font-semibold">Main graph view</div>
                  <div className="ascipio-panel flex w-fit overflow-hidden rounded-lg">
                    {(['global', 'local'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setGraphViewMode(mode)}
                        className={`ascipio-chip-hover px-3 py-1.5 capitalize ${graphViewMode === mode ? 'ascipio-chip-selected' : ''}`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                  <div className="ascipio-muted mt-1">
                    "Local" fills the whole canvas with just the focused note's neighborhood, physics and all.
                  </div>
                </div>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={localGraphWidgetEnabled}
                    onChange={(e) => setLocalGraphWidgetEnabled(e.target.checked)}
                  />
                  Show the local-graph corner widget
                </label>

                <div>
                  <button
                    onClick={() => {
                      setFocusMode(true)
                      onClose()
                    }}
                    className="ascipio-chip ascipio-chip-hover rounded px-2 py-1"
                  >
                    Enter focus mode
                  </button>
                  <div className="ascipio-muted mt-1">Hides all chrome; press Escape to exit.</div>
                </div>
              </div>
            )}

            {tab === 'Filters' && <FilterControls />}

            {tab === 'Appearance' && (
              <div className="flex flex-col gap-4">
                <div>
                  <div className="mb-1 font-semibold">Node color</div>
                  <div className="ascipio-panel flex w-fit overflow-hidden rounded-lg">
                    {(['tag', 'todo', 'plain'] as ColorMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setColorMode(mode)}
                        className={`ascipio-chip-hover px-3 py-1.5 capitalize ${colorMode === mode ? 'ascipio-chip-selected' : ''}`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1 font-semibold">Theme preset</div>
                  <div className="flex flex-wrap gap-1">
                    {Object.keys(THEME_PRESETS).map((id) => (
                      <button
                        key={id}
                        onClick={() => applyTheme(THEME_PRESETS[id])}
                        className="ascipio-chip ascipio-chip-hover rounded px-2 py-1"
                      >
                        {PRESET_LABELS[id] ?? id}
                      </button>
                    ))}
                  </div>
                  <div className="ascipio-muted mt-1">
                    A live Emacs connection overrides these with your actual theme automatically.
                  </div>
                </div>
              </div>
            )}

            {tab === 'Export' && (
              <div className="flex flex-col gap-3">
                <div className="ascipio-muted">
                  Copy this into your init file (after <code>(require 'org-ascipio)</code>) so future
                  connections start with your current physics/view/color settings instead of the built-in
                  defaults.
                </div>
                <pre className="ascipio-panel max-h-56 overflow-auto rounded-lg p-3 font-mono text-[11px] leading-relaxed">
                  {exportSettingsAsElisp({ physics, colorMode, graphViewMode, localGraphWidgetEnabled })}
                </pre>
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(
                      exportSettingsAsElisp({ physics, colorMode, graphViewMode, localGraphWidgetEnabled }),
                    )
                  }
                  className="ascipio-button-primary w-fit rounded px-3 py-1.5"
                >
                  Copy to clipboard
                </button>
                {lastEmacsDefaults && (
                  <button
                    onClick={() => resetToEmacsDefaults(setColorMode)}
                    className="ascipio-chip ascipio-chip-hover w-fit rounded px-2 py-1"
                  >
                    Reset to what Emacs last sent
                  </button>
                )}
              </div>
            )}

            {tab === 'Diagnostics' && <DebugPanel handle={graphHandle} />}
          </div>
        </div>
      </div>
    </div>
  )
}
