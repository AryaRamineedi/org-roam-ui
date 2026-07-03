import type Sigma from 'sigma'
import { CameraController, CameraLike, CameraState, FramingTarget } from './CameraController'

const FRAMING_PADDING = 1.6
const MIN_SPAN = 0.05

class SigmaCameraAdapter implements CameraLike {
  constructor(private readonly sigma: Sigma) {}

  get x(): number {
    return this.sigma.getCamera().x
  }
  get y(): number {
    return this.sigma.getCamera().y
  }
  get ratio(): number {
    return this.sigma.getCamera().ratio
  }

  setState(state: Partial<CameraState>): void {
    const camera = this.sigma.getCamera()
    camera.setState({
      x: state.x ?? camera.x,
      y: state.y ?? camera.y,
      ratio: state.ratio ?? camera.ratio,
      angle: camera.angle,
    })
  }
}

/** Frames a node together with its immediate neighbors (bounding box + padding). */
function makeFramingResolver(sigma: Sigma): (nodeId: string) => FramingTarget | null {
  return (nodeId: string) => {
    const graph = sigma.getGraph()
    if (!graph.hasNode(nodeId)) return null
    const ids = [nodeId, ...graph.neighbors(nodeId)]
    const points = ids
      .map((id) => sigma.getNodeDisplayData(id))
      .filter((p): p is NonNullable<typeof p> => p != null)
    if (points.length === 0) return null

    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const span = Math.max(maxX - minX, maxY - minY, MIN_SPAN)

    return {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      ratio: span * FRAMING_PADDING,
    }
  }
}

/** Wires a CameraController up to a live Sigma instance. */
export function createSigmaCameraController(sigma: Sigma): CameraController {
  return new CameraController({
    camera: new SigmaCameraAdapter(sigma),
    getFramingTarget: makeFramingResolver(sigma),
  })
}
