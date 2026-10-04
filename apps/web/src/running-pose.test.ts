import { describe, expect, it } from 'vitest'
import { runningPose } from './running-pose'
import type { ReplayPlayerMotion } from './replay'

const motion = (x: number, y: number, phase: number): ReplayPlayerMotion => ({
  direction: { x, y }, facing: x < 0 ? -1 : 1, activity: 1, phase,
})

describe('directional running poses', () => {
  it('alternates forward and backward leg reach instead of spreading both legs', () => {
    const pose = runningPose(motion(1, 0, Math.PI / 2))
    expect(pose.legs.find(leg => leg.side === -1)!.foot.x).toBeCloseTo(-12)
    expect(pose.legs.find(leg => leg.side === 1)!.foot.x).toBeCloseTo(12)
    const reverse = runningPose(motion(1, 0, Math.PI * 1.5))
    expect(reverse.legs.find(leg => leg.side === -1)!.foot.x).toBeCloseTo(4)
    expect(reverse.legs.find(leg => leg.side === 1)!.foot.x).toBeCloseTo(-4)
    const left = runningPose(motion(-1, 0, Math.PI / 2))
    expect(left.legs.find(leg => leg.side === -1)!.foot.x).toBeCloseTo(4)
    expect(left.legs.find(leg => leg.side === 1)!.foot.x).toBeCloseTo(-4)
  })
  it('moves feet in depth for vertical runs and draws the nearer leg last', () => {
    const pose = runningPose(motion(0, 1, Math.PI / 2))
    expect(pose.legs[0].foot.y).toBeCloseTo(-6.2)
    expect(pose.legs[1].foot.y).toBeCloseTo(4.2)
    expect(pose.legs.map(leg => leg.foot.x)).toEqual([-4, 4])
  })
  it('lifts one foot while bending its knee, then alternates the lifted foot', () => {
    const first = runningPose(motion(1, 0, 0)).legs
    const second = runningPose(motion(1, 0, Math.PI)).legs
    expect(first[0].foot.y).toBe(-6)
    expect(first[0].knee.x).toBeLessThan(first[0].foot.x)
    expect(first[0].foot.x).toBe(4)
    expect(second[0].foot.x).toBeCloseTo(-4)
  })
  it('settles into the same idle pose regardless of gait phase and direction', () => {
    const idle = runningPose()
    const stopped = runningPose({ ...motion(0, -1, 2), activity: 0 })
    expect(stopped).toEqual(idle)
    expect(idle.legs.every(leg => leg.foot.y === -1)).toBe(true)
  })
})
