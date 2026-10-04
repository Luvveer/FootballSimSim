import { describe, expect, it } from 'vitest'
import { BALL_RADIUS, ballRollDegrees, rollingBallPanels } from './ball-appearance'

describe('rolling football', () => {
  it('moves the panels across the visible hemisphere and repeats after a revolution', () => {
    const direction = { x: 1, y: 0 }
    const first = rollingBallPanels(0, direction)
    expect(rollingBallPanels(90, direction)).not.toEqual(first)
    const full = rollingBallPanels(360, direction)
    expect(full.length).toBe(first.length)
    first.forEach((points, index) => {
      const original = points.split(/[ ,]/).map(Number)
      const repeated = full[index].split(/[ ,]/).map(Number)
      original.forEach((value, i) => expect(repeated[i]).toBeCloseTo(value))
    })
  })

  it('keeps every panel within the spherical silhouette in all travel directions', () => {
    for (const direction of [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: -1 }]) {
      for (const rotation of [0, 45, 90, 180, 270]) {
        for (const panel of rollingBallPanels(rotation, direction)) {
          for (const point of panel.split(' ')) {
            expect(Math.hypot(...point.split(',').map(Number))).toBeLessThanOrEqual(BALL_RADIUS + 0.00001)
          }
        }
      }
    }
  })

  it('only spins when the ball travels, accounting for the camera scale', () => {
    expect(ballRollDegrees({ x: 30, y: 50 }, { x: 30, y: 50 })).toBe(0)
    const near = ballRollDegrees({ x: 30, y: 100 }, { x: 40, y: 100 })
    const far = ballRollDegrees({ x: 30, y: 0 }, { x: 40, y: 0 })
    expect(near).toBeGreaterThan(0)
    expect(near).toBeCloseTo(far)
  })
})
