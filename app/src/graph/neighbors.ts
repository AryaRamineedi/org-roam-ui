import Graph from 'graphology'

/**
 * Breadth-first N-hop neighborhood expansion, ported from the old project's
 * util/findNthNeighbour.ts (genuinely reusable pure logic — org-roam-ui had
 * no reason to redo this, and neither do we). Used by the local-graph
 * mini-panel (Phase 5) and available now for the camera framing/debug tools.
 */
export function findNthNeighbors(graph: Graph, nodeId: string, depth: number): Set<string> {
  const visited = new Set<string>([nodeId])
  let frontier = [nodeId]
  for (let hop = 0; hop < depth; hop += 1) {
    const next: string[] = []
    for (const id of frontier) {
      if (!graph.hasNode(id)) continue
      for (const neighbor of graph.neighbors(id)) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          next.push(neighbor)
        }
      }
    }
    frontier = next
    if (frontier.length === 0) break
  }
  return visited
}
