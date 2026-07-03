import { describe, expect, it, vi } from 'vitest'
import { CameraController, CameraState } from '../CameraController'

class FakeCamera implements CameraState {
  x = 0.5
  y = 0.5
  ratio = 1
  history: number[] = [this.ratio]

  setState(state: Partial<CameraState>): void {
    if (state.x !== undefined) this.x = state.x
    if (state.y !== undefined) this.y = state.y
    if (state.ratio !== undefined) {
      this.ratio = state.ratio
      this.history.push(this.ratio)
    }
  }
}

const MIN_RATIO = 0.05
const MAX_RATIO = 8

function makeController(camera: FakeCamera, framingTargets: Record<string, CameraState>) {
  return new CameraController({
    camera,
    getFramingTarget: (nodeId) => framingTargets[nodeId] ?? null,
    minRatio: MIN_RATIO,
    maxRatio: MAX_RATIO,
    debounceMs: 50,
    tweenMs: 200,
  })
}

describe('CameraController', () => {
  it('debounces rapid follow calls into a single committed tween', () => {
    vi.useFakeTimers()
    const camera = new FakeCamera()
    const targets = {
      a: { x: 0.1, y: 0.1, ratio: 1 },
      b: { x: 0.9, y: 0.9, ratio: 1 },
    }
    const controller = makeController(camera, targets)

    controller.followNode('a')
    vi.advanceTimersByTime(10)
    controller.followNode('b')
    // Only the debounced-through 'b' target should ever commit.
    vi.advanceTimersByTime(400)

    expect(camera.x).toBeCloseTo(0.9, 5)
    expect(camera.y).toBeCloseTo(0.9, 5)
    vi.useRealTimers()
  })

  it('never exceeds clamped ratio bounds during a burst of rapid follow events (regression test for the old infinite-zoom bug)', () => {
    vi.useFakeTimers()
    const camera = new FakeCamera()
    // Deliberately-unclamped targets to prove the controller clamps them itself.
    const targets: Record<string, CameraState> = {}
    for (let i = 0; i < 25; i += 1) {
      targets[`n${i}`] = { x: Math.random(), y: Math.random(), ratio: Math.random() * 50 + 0.001 }
    }
    const controller = makeController(camera, targets)

    // Simulate a fast C-n/C-p sweep: many follow events fired a few ms apart.
    for (let i = 0; i < 25; i += 1) {
      controller.followNode(`n${i}`)
      vi.advanceTimersByTime(15)
    }
    // Let the final tween finish settling.
    vi.advanceTimersByTime(1000)

    for (const ratio of camera.history) {
      expect(ratio).toBeGreaterThanOrEqual(MIN_RATIO)
      expect(ratio).toBeLessThanOrEqual(MAX_RATIO)
    }
    expect(controller.isAnimating()).toBe(false)
    vi.useRealTimers()
  })

  it('cancels an in-flight tween when a new target is committed', () => {
    vi.useFakeTimers()
    const camera = new FakeCamera()
    const targets = {
      a: { x: 0, y: 0, ratio: 1 },
      b: { x: 1, y: 1, ratio: 1 },
    }
    const controller = makeController(camera, targets)

    controller.followNode('a')
    vi.advanceTimersByTime(50) // commit 'a', tween starts
    vi.advanceTimersByTime(50) // partway through 'a' tween
    const midway = camera.x
    expect(midway).toBeGreaterThan(0)

    controller.followNode('b')
    vi.advanceTimersByTime(50) // commit 'b' — must cancel the 'a' tween, not layer on top of it
    vi.advanceTimersByTime(500)

    expect(camera.x).toBeCloseTo(1, 5)
    vi.useRealTimers()
  })

  it('is a no-op when re-following the node already settled on', () => {
    vi.useFakeTimers()
    const camera = new FakeCamera()
    const targets = { a: { x: 0.3, y: 0.3, ratio: 1 } }
    const controller = makeController(camera, targets)

    controller.followNode('a')
    vi.advanceTimersByTime(300)
    const settledHistoryLength = camera.history.length

    controller.followNode('a')
    vi.advanceTimersByTime(300)

    expect(camera.history.length).toBe(settledHistoryLength)
    vi.useRealTimers()
  })
})
