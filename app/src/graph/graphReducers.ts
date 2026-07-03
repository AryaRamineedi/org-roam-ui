import Graph from 'graphology'
import { Filters } from '../store/appStore'
import { GraphNode } from '../protocol/schema'
import { graphTheme } from './graphTheme'
import { colorForNode, ColorMode } from './nodeColor'

const DONE_STATES = new Set(['DONE', 'CANCELLED', 'CANCELED'])

export function isNodeVisible(node: GraphNode, degree: number, filters: Filters): boolean {
  if (filters.hideOrphans && degree === 0) return false
  if (filters.hideDoneTodos && node.todo && DONE_STATES.has(node.todo)) return false
  if (filters.excludedTags.length > 0 && node.tags.some((tag) => filters.excludedTags.includes(tag))) {
    return false
  }
  if (filters.includedTags.length > 0 && !node.tags.some((tag) => filters.includedTags.includes(tag))) {
    return false
  }
  return true
}

export interface ReducerRefs {
  hoveredNodeId: string | null
  selectedNodeId: string | null
  filters: Filters
  /** Lowercased search query; empty string means "no active search". */
  searchQuery: string
  colorMode: ColorMode
  /** Non-null in "local graph as main view" mode: only these node ids are
   *  shown, and the physics engine (GraphCanvas) simulates only this
   *  subset too, so hidden nodes don't silently warp the visible layout. */
  localScope: Set<string> | null
}

function matchesSearch(node: GraphNode, query: string): boolean {
  if (!query) return true
  const haystack = `${node.title} ${node.tags.join(' ')}`.toLowerCase()
  return haystack.includes(query)
}

/**
 * Builds Sigma's nodeReducer/edgeReducer pair from a mutable refs object
 * (read fresh on every frame Sigma calls them). Centralizing filter/hover/
 * search/selection styling here keeps it consistent and keeps GraphCanvas
 * from growing an ad hoc pile of conditionals.
 */
export function createReducers(graph: Graph, refs: ReducerRefs) {
  const nodeReducer = (nodeKey: string, data: Record<string, unknown>) => {
    const node = data as unknown as GraphNode
    const res: Record<string, unknown> = { ...data, color: colorForNode(node, refs.colorMode) }
    const degree = graph.degree(nodeKey)

    if (refs.localScope && !refs.localScope.has(nodeKey)) {
      res.hidden = true
      return res
    }
    if (!isNodeVisible(node, degree, refs.filters)) {
      res.hidden = true
      return res
    }

    const query = refs.searchQuery.trim().toLowerCase()
    if (query) {
      if (matchesSearch(node, query)) {
        res.color = graphTheme.hoverHighlight
        res.zIndex = 1
      } else {
        res.color = graphTheme.dim
      }
    } else if (refs.hoveredNodeId) {
      const isFocus = nodeKey === refs.hoveredNodeId || graph.areNeighbors(nodeKey, refs.hoveredNodeId)
      if (!isFocus) res.color = graphTheme.dim
      else res.zIndex = 1
    }

    if (nodeKey === refs.selectedNodeId) {
      res.color = graphTheme.selected
      res.zIndex = 2
      res.highlighted = true
    }

    return res
  }

  const edgeReducer = (edgeKey: string, data: Record<string, unknown>) => {
    const res: Record<string, unknown> = { ...data, color: graphTheme.edgeDefault }
    const [source, target] = graph.extremities(edgeKey)
    const sourceAttrs = graph.getNodeAttributes(source) as unknown as GraphNode
    const targetAttrs = graph.getNodeAttributes(target) as unknown as GraphNode

    if (refs.localScope && (!refs.localScope.has(source) || !refs.localScope.has(target))) {
      res.hidden = true
      return res
    }
    if (
      !isNodeVisible(sourceAttrs, graph.degree(source), refs.filters) ||
      !isNodeVisible(targetAttrs, graph.degree(target), refs.filters)
    ) {
      res.hidden = true
      return res
    }

    if (refs.hoveredNodeId && source !== refs.hoveredNodeId && target !== refs.hoveredNodeId) {
      res.color = graphTheme.dim
    }

    return res
  }

  return { nodeReducer, edgeReducer }
}
