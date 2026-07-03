import { useCallback, useEffect, useState } from 'react'
import { GraphCanvas, GraphCanvasHandle } from './graph/GraphCanvas'
import { LocalGraphWidget } from './graph/LocalGraphWidget'
import { useAscipioConnection } from './connection/useAscipioConnection'
import { useAppStore } from './store/appStore'
import { useSettingsStore } from './store/settingsStore'
import { applySnapshot } from './graph/graphData'
import { buildMockSnapshot } from './graph/mockGraph'
import { TopBar } from './views/TopBar/TopBar'
import { NotePane } from './views/Sidebar/NotePane'
import { AgendaView } from './views/Agenda/AgendaView'

export function App() {
  useAscipioConnection()
  const status = useAppStore((state) => state.connectionStatus)
  const viewMode = useAppStore((state) => state.viewMode)
  const selectedNodeId = useAppStore((state) => state.selectedNodeId)
  const bumpGraphVersion = useAppStore((state) => state.bumpGraphVersion)
  const focusMode = useSettingsStore((state) => state.focusMode)
  const setFocusMode = useSettingsStore((state) => state.setFocusMode)
  const localGraphWidgetEnabled = useSettingsStore((state) => state.localGraphWidgetEnabled)
  const [graphHandle, setGraphHandle] = useState<GraphCanvasHandle | null>(null)

  const handleReady = useCallback((handle: GraphCanvasHandle) => {
    setGraphHandle(handle)
    // Dev-only hook so Playwright/manual testing can compute exact node
    // screen coordinates instead of guessing; never included in prod builds.
    if (import.meta.env.DEV) {
      ;(window as unknown as { __ascipio: GraphCanvasHandle }).__ascipio = handle
    }
  }, [])

  const loadDemoGraph = () => {
    applySnapshot(buildMockSnapshot())
    bumpGraphVersion()
  }

  useEffect(() => {
    if (!focusMode) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFocusMode(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focusMode, setFocusMode])

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <GraphCanvas onReady={handleReady} />

      {!focusMode && viewMode === 'agenda' && (
        <div className="absolute inset-0 z-10 bg-[var(--ascipio-bg,#0b0f17)]">
          <AgendaView />
        </div>
      )}

      {focusMode ? (
        <button
          onClick={() => setFocusMode(false)}
          className="ascipio-panel ascipio-chip-hover pointer-events-auto absolute right-4 top-4 z-20 rounded-lg px-3 py-1.5 text-xs opacity-40 backdrop-blur hover:opacity-100"
        >
          Exit focus mode (Esc)
        </button>
      ) : (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <TopBar graphHandle={graphHandle} />
            {status !== 'open' && (
              <button
                onClick={loadDemoGraph}
                className="ascipio-panel ascipio-chip-hover pointer-events-auto rounded-lg px-3 py-1.5 text-xs backdrop-blur"
              >
                Load demo graph
              </button>
            )}
          </div>

          <div className="flex min-h-0 flex-1 justify-end">
            {selectedNodeId && viewMode === 'graph' && (
              <div className="h-full w-96">
                <NotePane />
              </div>
            )}
          </div>

          {viewMode === 'graph' && localGraphWidgetEnabled && (
            <div className="flex items-end justify-end gap-3">
              <LocalGraphWidget />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
