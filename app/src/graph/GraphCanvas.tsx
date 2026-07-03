import { useEffect, useRef } from 'react'
import Sigma from 'sigma'
import { graph } from './graphData'
import { CameraController } from './CameraController'
import { createSigmaCameraController } from './sigmaCameraController'
import { createReducers, ReducerRefs } from './graphReducers'
import { graphTheme } from './graphTheme'
import { GraphPhysicsEngine } from './physics'
import { findNthNeighbors } from './neighbors'
import { useAppStore } from '../store/appStore'
import { useSettingsStore } from '../store/settingsStore'

const LOCAL_VIEW_DEPTH = 2
/** Pixels of movement before a node press counts as a drag, not a click. */
const DRAG_THRESHOLD = 3

export interface GraphCanvasHandle {
  cameraController: CameraController | null
  sigma: Sigma
}

/**
 * The global graph view: a WebGL Sigma canvas over the graphology `graph`
 * singleton (graph/graphData.ts), continuously laid out by
 * GraphPhysicsEngine (graph/physics.ts) rather than a one-shot static
 * layout. Camera motion is exclusively driven through CameraController
 * (graph/CameraController.ts) — nothing else in this component is allowed
 * to touch the Sigma camera directly, which is what structurally prevents
 * the old project's runaway-zoom bug.
 *
 * Click selects a node (drives the NotePane sidebar); dragging repositions
 * it (pins it during the drag, then releases it back to the simulation);
 * double-click sends the `open` command so Emacs jumps to it. In "local"
 * graphViewMode (settingsStore), only the focused node's neighborhood is
 * simulated/shown, filling the whole canvas -- a full alternate mode, not
 * just the corner widget.
 */
export function GraphCanvas({
  onReady,
}: {
  onReady?: (handle: GraphCanvasHandle) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sigmaRef = useRef<Sigma | null>(null)
  const cameraControllerRef = useRef<CameraController | null>(null)
  const physicsRef = useRef<GraphPhysicsEngine | null>(null)
  const refsRef = useRef<ReducerRefs>({
    hoveredNodeId: null,
    selectedNodeId: null,
    filters: useAppStore.getState().filters,
    searchQuery: useAppStore.getState().searchQuery,
    colorMode: useAppStore.getState().colorMode,
    localScope: null,
  })

  const graphVersion = useAppStore((state) => state.graphVersion)
  const activeNodeId = useAppStore((state) => state.activeNodeId)
  const selectedNodeId = useAppStore((state) => state.selectedNodeId)
  const filters = useAppStore((state) => state.filters)
  const searchQuery = useAppStore((state) => state.searchQuery)
  const themeVersion = useAppStore((state) => state.themeVersion)
  const colorMode = useAppStore((state) => state.colorMode)
  const physics = useSettingsStore((state) => state.physics)
  const graphViewMode = useSettingsStore((state) => state.graphViewMode)

  useEffect(() => {
    if (!containerRef.current) return

    const { nodeReducer, edgeReducer } = createReducers(graph, refsRef.current)
    const sigma = new Sigma(graph, containerRef.current, {
      renderLabels: true,
      labelRenderedSizeThreshold: 6,
      defaultNodeColor: graphTheme.nodeDefault,
      defaultEdgeColor: graphTheme.edgeDefault,
      minCameraRatio: 0.05,
      maxCameraRatio: 8,
      nodeReducer,
      edgeReducer,
    })
    sigmaRef.current = sigma
    cameraControllerRef.current = createSigmaCameraController(sigma)
    physicsRef.current = new GraphPhysicsEngine(graph, useSettingsStore.getState().physics, () =>
      sigma.refresh({ skipIndexation: true }),
    )
    physicsRef.current.rebuild()
    onReady?.({ cameraController: cameraControllerRef.current, sigma })

    let draggedNode: string | null = null
    let dragStart: { x: number; y: number } | null = null
    let didDrag = false

    sigma.on('downNode', ({ node, event }) => {
      draggedNode = node
      dragStart = { x: event.x, y: event.y }
      didDrag = false
      sigma.getCamera().disable()
    })
    sigma.getMouseCaptor().on('mousemovebody', (event) => {
      if (!draggedNode) return
      if (!didDrag && dragStart) {
        const dx = event.x - dragStart.x
        const dy = event.y - dragStart.y
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD) didDrag = true
      }
      if (!didDrag) return
      const pos = sigma.viewportToGraph(event)
      physicsRef.current?.pin(draggedNode, pos.x, pos.y)
      sigma.refresh({ skipIndexation: true })
    })
    sigma.getMouseCaptor().on('mouseup', () => {
      if (draggedNode) {
        physicsRef.current?.unpin(draggedNode)
        draggedNode = null
      }
      sigma.getCamera().enable()
    })

    sigma.on('clickNode', ({ node }) => {
      if (didDrag) {
        didDrag = false
        return
      }
      useAppStore.getState().setSelectedNodeId(node)
    })
    sigma.on('clickStage', () => {
      useAppStore.getState().setSelectedNodeId(null)
    })
    sigma.on('doubleClickNode', ({ node, preventSigmaDefault }) => {
      preventSigmaDefault() // don't also trigger Sigma's default zoom-on-doubleclick
      useAppStore.getState().setSelectedNodeId(node)
      useAppStore.getState().setActiveNodeId(node)
      useAppStore.getState().sendCommand?.({ command: 'open', data: { id: node } })
    })
    sigma.on('enterNode', ({ node }) => {
      refsRef.current.hoveredNodeId = node
      sigma.refresh({ skipIndexation: true })
    })
    sigma.on('leaveNode', () => {
      refsRef.current.hoveredNodeId = null
      sigma.refresh({ skipIndexation: true })
    })

    return () => {
      cameraControllerRef.current?.cancelFollow()
      cameraControllerRef.current = null
      physicsRef.current?.destroy()
      physicsRef.current = null
      sigma.kill()
      sigmaRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recompute local-mode scope and rebuild the physics simulation whenever
  // the graph changes, the view mode toggles, or the focused node changes.
  // Rebuilding respects the current scope filter so hidden (out-of-scope)
  // nodes never influence the visible layout's forces.
  useEffect(() => {
    if (graph.order === 0) return
    const focusId = selectedNodeId ?? activeNodeId
    const scope =
      graphViewMode === 'local' && focusId && graph.hasNode(focusId)
        ? findNthNeighbors(graph, focusId, LOCAL_VIEW_DEPTH)
        : null
    refsRef.current.localScope = scope
    physicsRef.current?.rebuild(scope ? (id) => scope.has(id) : undefined)
    sigmaRef.current?.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphVersion, graphViewMode, activeNodeId, selectedNodeId])

  useEffect(() => {
    physicsRef.current?.applySettings(physics)
  }, [physics])

  useEffect(() => {
    if (activeNodeId) cameraControllerRef.current?.followNode(activeNodeId)
  }, [activeNodeId])

  useEffect(() => {
    refsRef.current.selectedNodeId = selectedNodeId
    sigmaRef.current?.refresh({ skipIndexation: true })
  }, [selectedNodeId])

  useEffect(() => {
    refsRef.current.filters = filters
    sigmaRef.current?.refresh()
  }, [filters, graphVersion])

  useEffect(() => {
    refsRef.current.searchQuery = searchQuery
    sigmaRef.current?.refresh({ skipIndexation: true })
  }, [searchQuery])

  useEffect(() => {
    refsRef.current.colorMode = colorMode
    sigmaRef.current?.refresh({ skipIndexation: true })
  }, [colorMode])

  // Theme changes recolor via the reducers above (no re-layout needed) --
  // just a plain refresh, kept separate from the graphVersion effect so a
  // theme switch never triggers a disruptive re-layout.
  useEffect(() => {
    if (!sigmaRef.current) return
    sigmaRef.current.setSetting('defaultNodeColor', graphTheme.nodeDefault)
    sigmaRef.current.setSetting('defaultEdgeColor', graphTheme.edgeDefault)
    sigmaRef.current.refresh({ skipIndexation: true })
  }, [themeVersion])

  return <div ref={containerRef} className="h-full w-full bg-[var(--ascipio-bg,#0b0f17)]" />
}
