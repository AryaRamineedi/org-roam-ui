import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  ForceLink,
  Simulation,
  SimulationNodeDatum,
} from 'd3-force'
import Graph from 'graphology'

/**
 * Continuous force-directed physics, replacing the old one-shot
 * forceatlas2 layout. Uses d3-force directly (not graphology-layout-
 * forceatlas2's worker mode) because its parameters map directly onto what
 * the old org-roam-ui exposed (itself built on d3-force-3d via
 * react-force-graph): charge/repulsion, link distance+strength, a
 * center/gravity pull, and alpha/velocity decay controlling how fast the
 * simulation settles. Obsidian's graph view uses a broadly similar force
 * model; the improvements here are (1) live, exposed parameters with
 * immediate visual feedback (Obsidian's are more limited), and (2)
 * collision radius so node circles and labels don't overlap illegibly,
 * which neither the old org-roam-ui nor Obsidian expose as a tunable --
 * this directly targets the "files look stretched out, text isn't
 * readable" complaint about the un-physically-simulated static layout.
 */
export interface PhysicsSettings {
  enabled: boolean
  /** Node repulsion; more negative = nodes push apart harder. */
  chargeStrength: number
  linkDistance: number
  linkStrength: number
  /** Pull toward the center, keeping the graph from drifting/flying apart; 0 disables ("gravity off"). */
  centeringStrength: number
  /** Minimum separation between node centers; 0 disables collision avoidance. */
  collideRadius: number
  alphaDecay: number
  velocityDecay: number
}

export const defaultPhysicsSettings: PhysicsSettings = {
  enabled: true,
  chargeStrength: -120,
  linkDistance: 90,
  linkStrength: 0.4,
  centeringStrength: 0.05,
  collideRadius: 10,
  alphaDecay: 0.02,
  velocityDecay: 0.35,
}

interface SimNode extends SimulationNodeDatum {
  id: string
}

interface SimLink {
  source: SimNode | string
  target: SimNode | string
}

type LinkForce = ForceLink<SimNode, SimLink>

const PRESETTLE_TICKS = 150

export class GraphPhysicsEngine {
  private simulation: Simulation<SimNode, undefined> | null = null
  private nodesById = new Map<string, SimNode>()

  constructor(
    private graph: Graph,
    private settings: PhysicsSettings,
    private onTick: () => void,
  ) {}

  /**
   * Rebuilds the d3 node/link arrays from the current graphology graph,
   * preserving position/velocity for nodes that already existed. When
   * NODEFILTER is given (local-graph-as-main-view mode), only nodes
   * passing it -- and edges where both endpoints do -- are simulated, so
   * hidden nodes don't silently warp the visible layout with their forces.
   */
  rebuild(nodeFilter?: (id: string) => boolean): void {
    const isNew = !this.simulation
    const nextNodes: SimNode[] = []
    this.graph.forEachNode((id, attrs) => {
      if (nodeFilter && !nodeFilter(id)) return
      const existing = this.nodesById.get(id)
      nextNodes.push(
        existing ?? {
          id,
          x: typeof attrs.x === 'number' ? attrs.x : (Math.random() - 0.5) * 200,
          y: typeof attrs.y === 'number' ? attrs.y : (Math.random() - 0.5) * 200,
        },
      )
    })
    const nodeIds = new Set(nextNodes.map((n) => n.id))
    this.nodesById = new Map(nextNodes.map((n) => [n.id, n]))

    const links: SimLink[] = []
    this.graph.forEachEdge((_edge, _attrs, source, target) => {
      if (nodeIds.has(source) && nodeIds.has(target)) links.push({ source, target })
    })

    if (!this.simulation) {
      this.simulation = forceSimulation<SimNode>(nextNodes).on('tick', () => this.syncToGraph())
    } else {
      this.simulation.nodes(nextNodes)
    }
    this.simulation.force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id))
    this.configureForces()

    // Pre-settle synchronously (independent of `enabled`) so the graph
    // never renders as a randomly-scattered/stretched mess on first paint
    // or after adding nodes -- "physics off" means "don't keep animating,"
    // not "skip layout entirely."
    this.simulation.stop()
    const ticks = isNew ? PRESETTLE_TICKS : Math.round(PRESETTLE_TICKS / 3)
    for (let i = 0; i < ticks; i += 1) this.simulation.tick()
    this.syncToGraph()

    if (this.settings.enabled) this.simulation.alpha(0.3).restart()
  }

  applySettings(settings: PhysicsSettings): void {
    const wasEnabled = this.settings.enabled
    this.settings = settings
    this.configureForces()
    const sim = this.simulation
    if (!sim) return
    if (settings.enabled) {
      sim.alpha(Math.max(sim.alpha(), 0.3)).restart()
    } else if (wasEnabled) {
      sim.stop()
    }
  }

  private configureForces(): void {
    const sim = this.simulation
    if (!sim) return
    const settings = this.settings
    sim.force('charge', forceManyBody().strength(settings.chargeStrength).distanceMax(600))
    const linkForce = sim.force('link') as LinkForce | undefined
    linkForce?.distance(settings.linkDistance).strength(settings.linkStrength)
    // forceCenter only recenters the *mean* of all node positions -- it does
    // nothing to stop an individual weakly-linked node from drifting away
    // forever (nothing pulls it back individually), which is what produced
    // the collapsed-clump-plus-flung-outliers bug. forceX/forceY apply a
    // real per-node spring toward the origin, bounding how far any single
    // node can drift regardless of how many links it has.
    sim.force('centerX', settings.centeringStrength > 0 ? forceX(0).strength(settings.centeringStrength) : null)
    sim.force('centerY', settings.centeringStrength > 0 ? forceY(0).strength(settings.centeringStrength) : null)
    sim.force('collide', settings.collideRadius > 0 ? forceCollide(settings.collideRadius) : null)
    sim.alphaDecay(settings.alphaDecay)
    sim.velocityDecay(settings.velocityDecay)
  }

  private syncToGraph(): void {
    this.nodesById.forEach((node, id) => {
      if (this.graph.hasNode(id) && typeof node.x === 'number' && typeof node.y === 'number') {
        this.graph.setNodeAttribute(id, 'x', node.x)
        this.graph.setNodeAttribute(id, 'y', node.y)
      }
    })
    this.onTick()
  }

  /** Pins a node to (x, y) during a drag and reheats the simulation. */
  pin(nodeId: string, x: number, y: number): void {
    const node = this.nodesById.get(nodeId)
    if (!node) return
    node.fx = x
    node.fy = y
    node.x = x
    node.y = y
    if (this.settings.enabled) this.simulation?.alphaTarget(0.3).restart()
    else this.syncToGraph()
  }

  /** Releases a pinned node after a drag, letting physics act on it again. */
  unpin(nodeId: string): void {
    const node = this.nodesById.get(nodeId)
    if (node) {
      node.fx = null
      node.fy = null
    }
    this.simulation?.alphaTarget(0)
  }

  destroy(): void {
    this.simulation?.stop()
    this.simulation = null
  }
}
