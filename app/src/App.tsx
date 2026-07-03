import { useCallback, useState } from 'react'
import { GraphCanvas, GraphCanvasHandle } from './graph/GraphCanvas'
import { DebugPanel } from './ui/DebugPanel'
import { useAscipioConnection } from './connection/useAscipioConnection'
import { useAppStore } from './store/appStore'
import { applySnapshot } from './graph/graphData'
import { buildMockSnapshot } from './graph/mockGraph'
import { runtime } from './runtime/capabilities'

const STATUS_LABEL: Record<string, string> = {
  connecting: 'Connecting to Emacs…',
  open: 'Connected to Emacs',
  reconnecting: 'Reconnecting…',
  closed: 'Disconnected',
}

export function App() {
  useAscipioConnection()
  const status = useAppStore((state) => state.connectionStatus)
  const bumpGraphVersion = useAppStore((state) => state.bumpGraphVersion)
  const [graphHandle, setGraphHandle] = useState<GraphCanvasHandle | null>(null)

  const handleReady = useCallback((handle: GraphCanvasHandle) => {
    setGraphHandle(handle)
  }, [])

  const loadDemoGraph = () => {
    applySnapshot(buildMockSnapshot())
    bumpGraphVersion()
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <GraphCanvas onReady={handleReady} />

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4">
        <div className="pointer-events-auto flex items-center justify-between">
          <div className="rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur">
            org-ascipio — {STATUS_LABEL[status] ?? status}
            {runtime.isTauri && <span className="ml-2 text-white/50">(standalone)</span>}
          </div>
          {status !== 'open' && (
            <button
              onClick={loadDemoGraph}
              className="pointer-events-auto rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur hover:bg-black/80"
            >
              Load demo graph
            </button>
          )}
        </div>

        <div className="pointer-events-auto self-end">
          <DebugPanel handle={graphHandle} />
        </div>
      </div>
    </div>
  )
}
