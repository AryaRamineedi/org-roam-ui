import { GraphSnapshot } from '../protocol/schema'

const MOCK_TAGS = ['project', 'school', 'personal', 'reading']
const MOCK_TODO_STATES = ['TODO', 'NEXT', 'WAITING', 'DONE']

/**
 * Synthetic graph generator, used by the in-app "load demo graph" affordance
 * and by CameraController tests — lets the camera-fix demo (and the color-
 * mode/filter/agenda features) be exercised without a live Emacs connection.
 */
export function buildMockSnapshot(nodeCount = 60): GraphSnapshot {
  const nodes = Array.from({ length: nodeCount }, (_, i) => {
    const hasTag = i % 3 !== 0
    const hasTodo = i % 4 === 0
    return {
      id: `mock-${i}`,
      file: `mock-${i}.org`,
      title: `Mock note ${i}`,
      level: 0,
      pos: 1,
      olp: null,
      tags: hasTag ? [MOCK_TAGS[i % MOCK_TAGS.length]] : [],
      properties: {},
      todo: hasTodo ? MOCK_TODO_STATES[i % MOCK_TODO_STATES.length] : null,
      priority: hasTodo && i % 8 === 0 ? 'A' : null,
      scheduled: null,
      deadline: hasTodo && i % 12 === 0 ? '2026-08-01T00:00:00' : null,
      backlinks: [],
    }
  })

  const links = Array.from({ length: nodeCount * 2 }, () => {
    const source = Math.floor(Math.random() * nodeCount)
    let target = Math.floor(Math.random() * nodeCount)
    while (target === source) target = Math.floor(Math.random() * nodeCount)
    return { source: `mock-${source}`, target: `mock-${target}`, type: 'id' as const }
  })

  return { nodes, links, tags: MOCK_TAGS }
}
