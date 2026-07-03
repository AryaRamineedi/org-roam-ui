/**
 * Fixes the "infinite zoom" bug from the old org-roam-ui project.
 *
 * Root cause in the old code (pages/index.tsx:362-495): every `follow`
 * websocket command called `fg.zoomToFit(...)` inside an un-cancelable
 * `setTimeout`, AND a second, independent `useEffect` keyed on scope changes
 * *also* called `zoomToFit(...)` in its own `setTimeout` — with no debounce,
 * no cancellation of in-flight tweens, and no min/max zoom clamp anywhere.
 * Rapid cursor movement in Emacs (post-command-hook fires on every command)
 * stacked overlapping, uncancelable tweens against an opaque third-party
 * camera wrapper, compounding into runaway zoom.
 *
 * CameraController is the single, first-class owner of camera motion: it
 * debounces bursts of follow events, cancels any in-flight tween before
 * starting a new one, drives the interpolation itself (rather than trusting
 * an opaque library-internal tween), and hard-clamps the zoom ratio as
 * defense in depth. No other code in this app is allowed to move the
 * camera directly.
 */

export interface CameraState {
  x: number
  y: number
  ratio: number
}

export interface CameraLike extends CameraState {
  setState(state: Partial<CameraState>): void
}

export interface FramingTarget extends CameraState {}

export type FramingResolver = (nodeId: string) => FramingTarget | null

export interface CancelableTween {
  cancel(): void
}

export interface CameraControllerOptions {
  camera: CameraLike
  /** Resolves a node id to the camera state that frames it (+ its neighbors). */
  getFramingTarget: FramingResolver
  /** Injectable for testing; default is a requestAnimationFrame-based clock. */
  requestFrame?: (cb: (time: number) => void) => number
  cancelFrame?: (handle: number) => void
  now?: () => number
  /** Coalesces bursts of rapid follow events (e.g. holding C-n in Emacs). */
  debounceMs?: number
  /** Duration of the camera tween itself. */
  tweenMs?: number
  minRatio?: number
  maxRatio?: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

const defaultRequestFrame = (cb: (time: number) => void): number => {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(cb)
  }
  return setTimeout(() => cb(Date.now()), 16) as unknown as number
}

const defaultCancelFrame = (handle: number): void => {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(handle)
  } else {
    clearTimeout(handle)
  }
}

export class CameraController {
  private readonly camera: CameraLike
  private readonly getFramingTarget: FramingResolver
  private readonly requestFrame: (cb: (time: number) => void) => number
  private readonly cancelFrame: (handle: number) => void
  private readonly now: () => number
  private readonly debounceMs: number
  private readonly tweenMs: number
  private readonly minRatio: number
  private readonly maxRatio: number

  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private pendingTarget: string | null = null
  private committedTarget: string | null = null
  private currentTween: CancelableTween | null = null

  constructor(options: CameraControllerOptions) {
    this.camera = options.camera
    this.getFramingTarget = options.getFramingTarget
    this.requestFrame = options.requestFrame ?? defaultRequestFrame
    this.cancelFrame = options.cancelFrame ?? defaultCancelFrame
    this.now = options.now ?? (() => Date.now())
    this.debounceMs = options.debounceMs ?? 120
    this.tweenMs = options.tweenMs ?? 400
    this.minRatio = options.minRatio ?? 0.05
    this.maxRatio = options.maxRatio ?? 8
  }

  /** Called on every incoming `follow` command. Debounced, single-writer. */
  followNode(nodeId: string): void {
    // Idempotent: already animating toward (or settled on) this node.
    if (nodeId === this.pendingTarget || (nodeId === this.committedTarget && !this.currentTween)) {
      return
    }
    this.pendingTarget = nodeId
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => this.commitFollow(), this.debounceMs)
  }

  /** Cancels any pending/in-flight camera motion. Used on unmount or mode switch. */
  cancelFollow(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.currentTween?.cancel()
    this.currentTween = null
    this.pendingTarget = null
  }

  /** True while a camera tween is actively animating. Exposed for tests/UI. */
  isAnimating(): boolean {
    return this.currentTween !== null
  }

  private commitFollow(): void {
    this.debounceTimer = null
    const nodeId = this.pendingTarget
    if (!nodeId) return

    const target = this.getFramingTarget(nodeId)
    if (!target) return

    // Single writer, cancel-in-flight: never more than one tween exists.
    this.currentTween?.cancel()
    this.committedTarget = nodeId

    const clampedTarget: CameraState = {
      x: target.x,
      y: target.y,
      ratio: clamp(target.ratio, this.minRatio, this.maxRatio),
    }
    this.currentTween = this.tweenTo(clampedTarget)
  }

  private tweenTo(target: CameraState): CancelableTween {
    const start: CameraState = { x: this.camera.x, y: this.camera.y, ratio: this.camera.ratio }
    const startTime = this.now()
    let cancelled = false
    let frameHandle = 0

    const step = (): void => {
      if (cancelled) return
      const elapsed = this.now() - startTime
      const t = clamp(elapsed / this.tweenMs, 0, 1)
      const eased = easeInOutQuad(t)
      this.camera.setState({
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased,
        ratio: clamp(start.ratio + (target.ratio - start.ratio) * eased, this.minRatio, this.maxRatio),
      })
      if (t < 1) {
        frameHandle = this.requestFrame(step)
      } else if (this.currentTween === tween) {
        this.currentTween = null
      }
    }

    const tween: CancelableTween = {
      cancel: () => {
        cancelled = true
        this.cancelFrame(frameHandle)
      },
    }

    frameHandle = this.requestFrame(step)
    return tween
  }
}
