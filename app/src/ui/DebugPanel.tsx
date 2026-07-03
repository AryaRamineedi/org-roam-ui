import { useEffect, useRef, useState } from 'react'
import type { GraphCanvasHandle } from '../graph/GraphCanvas'
import { graph } from '../graph/graphData'

const BURST_SIZE = 25
const BURST_INTERVAL_MS = 15
const MIN_RATIO = 0.05
const MAX_RATIO = 8

/**
 * Dev-only panel that proves the camera fix: fires a burst of synthetic
 * `follow` events in rapid succession (simulating a fast C-n/C-p sweep
 * across Emacs headings) directly at CameraController, then reports the
 * min/max camera ratio observed during and after the burst. In the old
 * project this exact pattern produced runaway/infinite zoom (see
 * CameraController.ts doc comment); here the ratio must stay within
 * [MIN_RATIO, MAX_RATIO] and the camera must settle smoothly.
 */
export function DebugPanel({ handle }: { handle: GraphCanvasHandle | null }) {
  const [running, setRunning] = useState(false)
  const [observed, setObserved] = useState<{ min: number; max: number; samples: number } | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current)
  }, [])

  const fireBurst = () => {
    if (!handle?.cameraController || running) return
    const nodeIds = graph.nodes()
    if (nodeIds.length === 0) return

    setRunning(true)
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    let samples = 0

    pollRef.current = setInterval(() => {
      const ratio = handle.sigma.getCamera().ratio
      min = Math.min(min, ratio)
      max = Math.max(max, ratio)
      samples += 1
    }, 8)

    let i = 0
    const fireNext = () => {
      const nodeId = nodeIds[Math.floor(Math.random() * nodeIds.length)]
      handle.cameraController?.followNode(nodeId)
      i += 1
      if (i < BURST_SIZE) {
        setTimeout(fireNext, BURST_INTERVAL_MS)
      } else {
        // Let the final tween finish settling before reporting.
        setTimeout(() => {
          if (pollRef.current) clearInterval(pollRef.current)
          setObserved({ min, max, samples })
          setRunning(false)
        }, 800)
      }
    }
    fireNext()
  }

  const withinBounds = observed ? observed.min >= MIN_RATIO && observed.max <= MAX_RATIO : null

  return (
    <div className="pointer-events-auto flex flex-col gap-2 rounded-lg border border-white/10 bg-black/60 p-3 text-xs text-white backdrop-blur">
      <div className="font-semibold">Camera fix demo</div>
      <button
        onClick={fireBurst}
        disabled={running}
        className="rounded bg-blue-600 px-2 py-1 font-medium disabled:opacity-50"
      >
        {running ? 'Firing follow burst…' : `Fire ${BURST_SIZE} rapid follow events`}
      </button>
      {observed && (
        <div className={withinBounds ? 'text-green-400' : 'text-red-400'}>
          ratio range: {observed.min.toFixed(3)} – {observed.max.toFixed(3)} ({observed.samples} samples)
          <br />
          {withinBounds ? 'stayed within clamped bounds — no runaway zoom' : 'OUT OF BOUNDS'}
        </div>
      )}
    </div>
  )
}
