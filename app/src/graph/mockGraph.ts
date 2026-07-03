import { GraphSnapshot } from '../protocol/schema'

/**
 * Synthetic graph generator, used by the in-app "load demo graph" affordance
 * and by CameraController tests — lets the camera-fix demo (and CI) run
 * without a live Emacs connection.
 */
export function buildMockSnapshot(nodeCount = 60): GraphSnapshot {
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    id: `mock-${i}`,
    file: `mock-${i}.org`,
    title: `Mock note ${i}`,
    level: 0,
    pos: 1,
    olp: null,
    tags: i % 5 === 0 ? ['demo'] : [],
    properties: {},
    todo: i % 7 === 0 ? 'TODO' : null,
    priority: null,
    scheduled: null,
    deadline: null,
    backlinks: [],
  }))

  const links = Array.from({ length: nodeCount * 2 }, () => {
    const source = Math.floor(Math.random() * nodeCount)
    let target = Math.floor(Math.random() * nodeCount)
    while (target === source) target = Math.floor(Math.random() * nodeCount)
    return { source: `mock-${source}`, target: `mock-${target}`, type: 'id' as const }
  })

  return { nodes, links, tags: ['demo'] }
}
