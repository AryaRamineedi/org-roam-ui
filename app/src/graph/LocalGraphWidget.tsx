import { useEffect, useRef, useState } from 'react'
import Graph from 'graphology'
import Sigma from 'sigma'
import { circular } from 'graphology-layout'
import { graph as globalGraph } from './graphData'
import { findNthNeighbors } from './neighbors'
import { graphTheme } from './graphTheme'
import { useAppStore } from '../store/appStore'

const DEFAULT_DEPTH = 1
const GRAPH_LABEL_FONT =
  "ui-monospace, 'SF Mono', 'JetBrains Mono', 'Cascadia Code', Menlo, Consolas, 'Liberation Mono', monospace"

/**
 * Obsidian-style local-graph corner widget: a small, always-visible, second
 * Sigma instance showing only the immediate neighborhood of whichever note
 * is currently focused (selected or followed from Emacs) -- independent of
 * the main graph's pan/zoom. Laid out once per focus change with a cheap
 * circular layout rather than a continuous physics simulation, since it
 * needs to be lightweight and non-distracting, not physically simulated.
 */
export function LocalGraphWidget() {
  const containerRef = useRef<HTMLDivElement>(null)
  const sigmaRef = useRef<Sigma | null>(null)
  const localGraphRef = useRef(new Graph())
  const [depth, setDepth] = useState(DEFAULT_DEPTH)

  const selectedNodeId = useAppStore((state) => state.selectedNodeId)
  const activeNodeId = useAppStore((state) => state.activeNodeId)
  const setSelectedNodeId = useAppStore((state) => state.setSelectedNodeId)
  const setActiveNodeId = useAppStore((state) => state.setActiveNodeId)
  const graphVersion = useAppStore((state) => state.graphVersion)
  const themeVersion = useAppStore((state) => state.themeVersion)

  const focusId = selectedNodeId ?? activeNodeId

  useEffect(() => {
    if (!containerRef.current) return
    const sigma = new Sigma(localGraphRef.current, containerRef.current, {
      renderLabels: true,
      labelRenderedSizeThreshold: 0,
      labelFont: GRAPH_LABEL_FONT,
      defaultNodeColor: graphTheme.nodeDefault,
      defaultEdgeColor: graphTheme.edgeDefault,
      minCameraRatio: 0.3,
      maxCameraRatio: 3,
    })
    sigma.on('clickNode', ({ node }) => {
      setSelectedNodeId(node)
      setActiveNodeId(node)
    })
    sigmaRef.current = sigma
    return () => {
      sigma.kill()
      sigmaRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const local = localGraphRef.current
    local.clear()
    if (!focusId || !globalGraph.hasNode(focusId)) {
      sigmaRef.current?.refresh()
      return
    }

    const neighborhood = findNthNeighbors(globalGraph, focusId, depth)
    neighborhood.forEach((id) => {
      const attrs = globalGraph.getNodeAttributes(id)
      local.addNode(id, { ...attrs, x: 0, y: 0, color: graphTheme.nodeDefault })
    })
    globalGraph.forEachEdge((_edge, attrs, source, target) => {
      if (neighborhood.has(source) && neighborhood.has(target) && !local.hasEdge(source, target)) {
        local.addEdge(source, target, { ...attrs, color: graphTheme.edgeDefault })
      }
    })
    circular.assign(local)
    // Pin the focus node dead-center for a stable, legible "you are here" layout.
    if (local.hasNode(focusId)) {
      local.setNodeAttribute(focusId, 'x', 0)
      local.setNodeAttribute(focusId, 'y', 0)
      local.setNodeAttribute(focusId, 'color', graphTheme.selected)
    }
    sigmaRef.current?.setSetting('defaultNodeColor', graphTheme.nodeDefault)
    sigmaRef.current?.setSetting('defaultEdgeColor', graphTheme.edgeDefault)
    sigmaRef.current?.refresh()
  }, [focusId, depth, graphVersion, themeVersion])

  return (
    <div className="ascipio-panel pointer-events-auto flex w-64 flex-col overflow-hidden rounded-lg backdrop-blur">
      <div className="ascipio-label flex items-center justify-between border-b border-[var(--ascipio-border)] px-2 py-1">
        <span>Local graph</span>
        <div className="flex gap-1">
          {[1, 2].map((d) => (
            <button
              key={d}
              onClick={() => setDepth(d)}
              className={`ascipio-chip-hover rounded px-1.5 ${depth === d ? 'ascipio-chip-selected' : ''}`}
            >
              {d} hop
            </button>
          ))}
        </div>
      </div>
      <div className="relative h-40 w-full">
        <div ref={containerRef} className="absolute inset-0" />
        {!focusId && (
          <div className="ascipio-muted absolute inset-0 flex items-center justify-center px-4 text-center text-[11px]">
            Select a note to see its local graph
          </div>
        )}
      </div>
    </div>
  )
}
