import Graph from 'graphology'
import { GraphLink, GraphNode, GraphPatch, GraphSnapshot } from '../protocol/schema'

/**
 * The graphology Graph instance is the single source of truth for graph
 * data and is intentionally kept OUTSIDE Zustand/React state — it's a
 * hot-path structure mutated on every websocket update and read every
 * animation frame by Sigma. Routing it through React state (as the old
 * project's useRef-heavy approach approximated ad hoc) would mean either
 * fighting reconciliation or losing reactivity; graphology already exposes
 * its own event emitter (`graph.on('nodeAdded', ...)`) for anything that
 * does need to react to changes, which Sigma itself uses to stay in sync.
 */
export const graph = new Graph({ multi: false, type: 'directed' })

function edgeKey(link: Pick<GraphLink, 'source' | 'target' | 'type'>): string {
  return `${link.source}->${link.target}:${link.type}`
}

// Placeholder styling until the Phase 5 ThemeTokens -> Sigma pipeline lands;
// keeps the renderer functional without a live theme connection.
const DEFAULT_NODE_COLOR = '#8aa2c8'
const DEFAULT_EDGE_COLOR = 'rgba(148, 163, 184, 0.35)'

function upsertNode(node: GraphNode): void {
  const existing = graph.hasNode(node.id) ? graph.getNodeAttributes(node.id) : null
  const attributes = {
    ...node,
    label: node.title,
    x: existing?.x ?? Math.random(),
    y: existing?.y ?? Math.random(),
    size: 4 + Math.min(node.backlinks.length, 12),
    color: DEFAULT_NODE_COLOR,
  }
  if (graph.hasNode(node.id)) {
    graph.replaceNodeAttributes(node.id, attributes)
  } else {
    graph.addNode(node.id, attributes)
  }
}

function upsertLink(link: GraphLink): void {
  // Dangling links (target not yet seen) are dropped rather than crashing —
  // the old project synthesized placeholder "bad" nodes for this; org-ascipio
  // instead just waits for the real node to arrive (e.g. via a later patch)
  // and re-applies once both endpoints exist.
  if (!graph.hasNode(link.source) || !graph.hasNode(link.target)) return
  const key = edgeKey(link)
  if (graph.hasEdge(key)) return
  // NOTE: Sigma reserves the node/edge attribute name `type` to select the
  // rendering program (e.g. 'line', 'arrow') — our semantic link kind
  // ('id' | 'cite' | 'ref' | ...) is stored as `linkType` to avoid colliding
  // with it (setting `type: 'id'` previously broke Sigma's program lookup).
  graph.addEdgeWithKey(key, link.source, link.target, { linkType: link.type, color: DEFAULT_EDGE_COLOR })
}

export function applySnapshot(snapshot: GraphSnapshot): void {
  graph.clear()
  snapshot.nodes.forEach(upsertNode)
  snapshot.links.forEach(upsertLink)
}

export function applyPatch(patch: GraphPatch): void {
  patch.removeLinks.forEach((link) => {
    const key = edgeKey(link)
    if (graph.hasEdge(key)) graph.dropEdge(key)
  })
  patch.removeNodeIds.forEach((id) => {
    if (graph.hasNode(id)) graph.dropNode(id)
  })
  patch.upsertNodes.forEach(upsertNode)
  patch.upsertLinks.forEach(upsertLink)
}
