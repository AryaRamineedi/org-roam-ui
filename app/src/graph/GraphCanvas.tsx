import { useEffect, useRef } from 'react'
import Sigma from 'sigma'
import { random } from 'graphology-layout'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import { graph } from './graphData'
import { CameraController } from './CameraController'
import { createSigmaCameraController } from './sigmaCameraController'
import { useAppStore } from '../store/appStore'

const LAYOUT_ITERATIONS = 150

export interface GraphCanvasHandle {
  cameraController: CameraController | null
  sigma: Sigma
}

/**
 * The global graph view: a WebGL Sigma canvas over the graphology `graph`
 * singleton (graph/graphData.ts). Camera motion is exclusively driven
 * through CameraController (graph/CameraController.ts) — nothing else in
 * this component is allowed to touch the Sigma camera directly, which is
 * what structurally prevents the old project's runaway-zoom bug.
 */
export function GraphCanvas({
  onReady,
}: {
  onReady?: (handle: GraphCanvasHandle) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sigmaRef = useRef<Sigma | null>(null)
  const cameraControllerRef = useRef<CameraController | null>(null)
  const graphVersion = useAppStore((state) => state.graphVersion)
  const activeNodeId = useAppStore((state) => state.activeNodeId)

  useEffect(() => {
    if (!containerRef.current) return

    const sigma = new Sigma(graph, containerRef.current, {
      renderLabels: true,
      labelRenderedSizeThreshold: 6,
      defaultNodeColor: '#8aa2c8',
      defaultEdgeColor: 'rgba(148, 163, 184, 0.35)',
      minCameraRatio: 0.05,
      maxCameraRatio: 8,
    })
    sigmaRef.current = sigma
    cameraControllerRef.current = createSigmaCameraController(sigma)
    onReady?.({ cameraController: cameraControllerRef.current, sigma })

    return () => {
      cameraControllerRef.current?.cancelFollow()
      cameraControllerRef.current = null
      sigma.kill()
      sigmaRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-layout on every graph mutation. Synchronous forceatlas2.assign() is
  // fine at MVP scale (typical vaults: 1k-10k nodes); offloading to a worker
  // is a documented later optimization, not required for the first PR.
  useEffect(() => {
    if (graph.order === 0) return
    let needsRandomInit = false
    graph.forEachNode((_, attrs) => {
      if (typeof attrs.x !== 'number' || typeof attrs.y !== 'number') needsRandomInit = true
    })
    if (needsRandomInit) random.assign(graph)
    forceAtlas2.assign(graph, {
      iterations: LAYOUT_ITERATIONS,
      settings: forceAtlas2.inferSettings(graph),
    })
    sigmaRef.current?.refresh()
  }, [graphVersion])

  useEffect(() => {
    if (activeNodeId) cameraControllerRef.current?.followNode(activeNodeId)
  }, [activeNodeId])

  return <div ref={containerRef} className="h-full w-full bg-[var(--ascipio-bg,#0b0f17)]" />
}
