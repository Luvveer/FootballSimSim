import { describe, expect, it } from 'vitest'
import { GOAL, PITCH_VIEW, goalBallPosition, goalGeometry, projectPitch } from './pitch-geometry'

describe('angled pitch geometry', () => {
  it('enlarges the framing without cropping the turf or exterior nets', () => {
    expect(PITCH_VIEW.width).toBeLessThan(1000)
    const points = [0,100].flatMap(x => [0,100].map(y => ({ x,y })))
    for (const end of [0,100] as const) points.push(...goalGeometry(end).footprint)
    for (const point of points) {
      const projected = projectPitch(point)
      expect(projected.x).toBeGreaterThan(PITCH_VIEW.x)
      expect(projected.x).toBeLessThan(PITCH_VIEW.x + PITCH_VIEW.width)
      expect(projected.y).toBeGreaterThan(PITCH_VIEW.y)
      expect(projected.y).toBeLessThan(PITCH_VIEW.y + PITCH_VIEW.height)
    }
  })
  it('keeps the halfway line centered and makes the near touchline wider', () => {
    for (const y of [0, 20, 50, 100]) expect(projectPitch({ x: 50, y }).x).toBe(500)
    const far = projectPitch({ x: 100, y: 0 }).x - projectPitch({ x: 0, y: 0 }).x
    const near = projectPitch({ x: 100, y: 100 }).x - projectPitch({ x: 0, y: 100 }).x
    expect(near).toBeGreaterThan(far)
    expect(projectPitch({ x: 50, y: 100 }).y).toBeGreaterThan(projectPitch({ x: 50, y: 0 }).y)
  })

  it.each([0, 100] as const)('places goal %s on the end line with its net outside the field', end => {
    const { mouth, back, outward } = goalGeometry(end)
    expect(mouth.every(point => point.x === end)).toBe(true)
    expect((mouth[0].y + mouth[1].y) / 2).toBe(50)
    expect(back.every(point => (point.x - end) * outward === GOAL.depth)).toBe(true)
    expect(projectPitch(mouth[0], GOAL.height).y).toBeLessThan(projectPitch(mouth[0]).y)
  })

  it('keeps projected field lines straight, including offside guides', () => {
    const a = projectPitch({ x: 27, y: 0 }), b = projectPitch({ x: 27, y: 100 })
    const mid = projectPitch({ x: 27, y: 50 })
    expect((mid.x - a.x) * (b.y - a.y) - (mid.y - a.y) * (b.x - a.x)).toBeCloseTo(0)
  })

  it('raises the ball without moving its ground coordinate horizontally', () => {
    const ground = projectPitch({ x: 35, y: 65 })
    const air = projectPitch({ x: 35, y: 65 }, 30)
    expect(air.x).toBe(ground.x)
    expect(air.y).toBeLessThan(ground.y)
  })

  it.each([1, -1])('puts a revealed goal into the outward net in direction %s', direction => {
    const point = { x: direction === 1 ? 98 : 2, y: 50 }
    expect(goalBallPosition(point, direction, 0)).toEqual(point)
    const finish = goalBallPosition(point, direction, 0.25)
    expect(finish.x).toBe(direction === 1 ? 103 : -3)
    expect(finish.y).toBe(50)
    expect(goalBallPosition(point, direction, 4)).toEqual(finish)
  })
})
