import { GraphNode } from '../protocol/schema'
import { graphTheme } from './graphTheme'

export type ColorMode = 'plain' | 'tag' | 'todo'

const DONE_LIKE = new Set(['DONE', 'CANCELLED', 'CANCELED'])
const ACTIVE_LIKE = new Set(['TODO', 'NEXT'])

/** Small stable string hash (djb2), used to deterministically map a string to a palette index. */
function hashString(value: string): number {
  let hash = 5381
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 33) ^ value.charCodeAt(i)
  }
  return hash >>> 0
}

function paletteColorFor(key: string): string {
  const palette = graphTheme.accentPalette
  if (palette.length === 0) return graphTheme.nodeDefault
  return palette[hashString(key) % palette.length]
}

/**
 * Deterministic per-tag-set coloring: the same set of tags always hashes to
 * the same accent color (stable across reloads/sessions, no color
 * assignment needs to be stored anywhere). Nodes sharing all their tags
 * share a color; a node with a different tag set gets a different
 * (deterministic) one. True multi-color-per-tag rendering (a small pie per
 * node) is a documented stretch goal in docs/VISUAL_ROADMAP.md, not
 * implemented here -- it needs a custom Sigma node program.
 */
function colorForTags(node: GraphNode): string {
  if (node.tags.length === 0) return graphTheme.nodeDefault
  return paletteColorFor([...node.tags].sort().join(','))
}

/**
 * TODO-state coloring: prefers Emacs's own org-todo-keyword-faces mapping
 * (graphTheme.todoColors) when supplied, otherwise falls back to a
 * semantic red/orange/green split so the app is still useful without a
 * live Emacs connection (e.g. running from a built-in preset).
 */
function colorForTodo(node: GraphNode): string {
  if (!node.todo) return graphTheme.nodeDefault
  const fromEmacs = graphTheme.todoColors[node.todo]
  if (fromEmacs) return fromEmacs
  if (DONE_LIKE.has(node.todo)) return graphTheme.accentPalette[3] // green
  if (ACTIVE_LIKE.has(node.todo)) return graphTheme.accentPalette[0] // red
  return graphTheme.accentPalette[1] // orange, e.g. WAITING and other custom states
}

export function colorForNode(node: GraphNode, mode: ColorMode): string {
  switch (mode) {
    case 'tag':
      return colorForTags(node)
    case 'todo':
      return colorForTodo(node)
    case 'plain':
    default:
      return graphTheme.nodeDefault
  }
}
