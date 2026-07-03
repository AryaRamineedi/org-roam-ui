import { useCallback, useState } from 'react'
import { GraphCanvas, GraphCanvasHandle } from './graph/GraphCanvas'
import { LocalGraphWidget } from './graph/LocalGraphWidget'
import { DebugPanel } from './ui/DebugPanel'
import { useAscipioConnection } from './connection/useAscipioConnection'
import { useAppStore } from './store/appStore'
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

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <GraphCanvas onReady={handleReady} />

      {viewMode === 'agenda' && (
        <div className="absolute inset-0 z-10 bg-[var(--ascipio-bg,#0b0f17)]">
          <AgendaView />
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <TopBar />
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

        {viewMode === 'graph' && (
          <div className="flex items-end justify-end gap-3">
            <LocalGraphWidget />
            <DebugPanel handle={graphHandle} />
          </div>
        )}
      </div>
    </div>
  )
}
