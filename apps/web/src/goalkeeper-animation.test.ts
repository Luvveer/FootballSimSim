import { describe, expect, it } from 'vitest'
import type { ReplayPlayer, ReplaySnapshot } from '@footballsimsim/shared'
import type { MatchEvent } from './types'
import { replayFrame } from './replay'
import { goalkeeperPose } from './goalkeeper-animation'
import { projectPitch } from './pitch-geometry'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MatchPitch } from './MatchPitch'

function fixture(outcome: 'save' | 'goal' | 'block' | 'wide' = 'save', direction: 1 | -1 = 1, period: 1 | 2 = 1, targetY = 50) {
  const x = (value: number) => direction === 1 ? value : 100 - value
  const shooter: ReplayPlayer = { key: 'HOME:shooter', playerId: 'shooter', name: 'Shooter', team: 'HOME', role: 'FWD', slotId: 'ST', x: x(75), y: 45, energy: 95, yellowCards: 0 }
  const keeper: ReplayPlayer = { ...shooter, key: 'AWAY:keeper', playerId: 'keeper', name: 'Keeper', team: 'AWAY', role: 'GK', slotId: 'GK', x: x(93), y: 50 }
  const initial: ReplaySnapshot = { players: [shooter, keeper], ball: { x: x(75), y: 45 }, carrierKey: shooter.key,
    possession: 'HOME', phase: 'ATTACK', status: 'PLAY', period, direction: { HOME: direction, AWAY: direction === 1 ? -1 : 1 },
    teamStats: {} as ReplaySnapshot['teamStats'] }
  const shot: MatchEvent = { minute: 2, type: 'shot', team: 'home', player: 'Shooter', playerId: 'shooter', detail: 'Shot', successful: outcome === 'save' || outcome === 'goal',
    snapshot: { ...initial, phase: 'SHOT', ball: { x: x(98), y: outcome === 'wide' ? 25 : targetY } },
    ballMotion: { kind: 'SHOT', from: { ...initial.ball }, to: { x: x(98), y: targetY } } }
  const finish: MatchEvent = { minute: 2, type: outcome === 'wide' ? 'ball_out' : outcome, team: outcome === 'goal' || outcome === 'wide' ? 'home' : 'away',
    player: outcome === 'save' ? 'Keeper' : 'Shooter', playerId: outcome === 'save' ? 'keeper' : 'shooter', detail: outcome,
    homeScore: outcome === 'goal' ? 1 : 0, awayScore: 0,
    snapshot: { ...initial, phase: outcome === 'goal' ? 'GOAL' : 'SHOT', possession: outcome === 'save' ? 'AWAY' : 'HOME',
      carrierKey: outcome === 'save' ? keeper.key : shooter.key, ball: { x: x(outcome === 'save' ? 93 : 98), y: outcome === 'goal' ? targetY : 50 } } }
  const next: MatchEvent = { minute: 5, type: 'pass', team: 'away', player: 'Keeper', detail: 'Pass', snapshot: { ...finish.snapshot!, ball: { x: 50, y: 50 }, phase: 'PROGRESSION' } }
  return { initial, events: [shot, finish, next], keeper }
}

describe('goalkeeper shot sequences', () => {
  it('holds the ball until a brisk flight window and reaches at the save timestamp', () => {
    const { initial, events } = fixture()
    const waiting = replayFrame(events, initial, 1)
    expect(waiting.snapshot!.ball).toEqual(initial.ball)
    expect(waiting.snapshot!.carrierKey).toBe('HOME:shooter')
    expect(waiting.keeperMotion).toEqual({})
    expect(waiting.rotation).toBe(replayFrame(events, initial, 0.5).rotation)
    const flight = replayFrame(events, initial, 1.9)
    expect(flight.loft).toBeGreaterThan(0)
    expect(flight.snapshot!.ball.x).toBeGreaterThan(initial.ball.x)
    expect(flight.keeperMotion['AWAY:keeper'].stage).toBe('reach')
    expect(flight.visibleCount).toBe(0)
    expect(flight.snapshot!.possession).toBe('HOME')
    expect(flight.snapshot!.teamStats).toEqual(initial.teamStats)
    expect(flight.snapshot!.carrierKey).toBeUndefined()
    const saved = replayFrame(events, initial, 2)
    expect(saved.visibleCount).toBe(2)
    expect(saved.snapshot!.possession).toBe('AWAY')
    expect(saved.keeperMotion['AWAY:keeper'].extension).toBe(1)
  })
  it.each([[1, 42], [1, 51.4], [1, 58], [-1, 42], [-1, 51.4], [-1, 58]] as const)('connects both gloves to the ball facing %s with target y=%s', (direction, targetY) => {
    const { initial, events, keeper } = fixture('save', direction, direction === 1 ? 1 : 2, targetY)
    const frame = replayFrame(events, initial, 2)
    const motion = frame.keeperMotion[keeper.key]
    const pose = goalkeeperPose(motion)
    const hand = { x: (pose.hands[0].x + pose.hands[1].x) / 2, y: pose.hands[0].y }
    const angle = motion.rotation * Math.PI / 180
    const anchor = projectPitch(keeper)
    const ball = projectPitch(frame.snapshot!.ball, frame.loft * 125 + 5)
    for (const figureScale of [1, 1.25]) {
      const offset = figureScale === 1 ? motion.offset : motion.mobileOffset
      const worldHand = {
        x: anchor.x + (hand.x * Math.cos(angle) - (hand.y + 17) * motion.bodyScale * Math.sin(angle) + offset.x) * anchor.scale * figureScale,
        y: anchor.y + (-17 + hand.x * Math.sin(angle) + (hand.y + 17) * motion.bodyScale * Math.cos(angle) + offset.y) * anchor.scale * figureScale,
      }
      expect(worldHand.x).toBeCloseTo(ball.x)
      expect(worldHand.y).toBeCloseTo(ball.y)
    }
    if (motion.diveSide !== 0) expect(Math.sign(motion.rotation)).toBe(motion.diveSide * direction)
  })
  it('attempts a save on goals and reveals the score only at its timestamp', () => {
    const { initial, events } = fixture('goal')
    expect(replayFrame(events, initial, 1.9).keeperMotion['AWAY:keeper'].stage).toBe('reach')
    expect(replayFrame(events, initial, 1.9).visibleCount).toBe(0)
    const goal = replayFrame(events, initial, 2.2)
    expect(goal.visibleCount).toBe(2)
    expect(goal.snapshot!.ball.x).toBeGreaterThan(100)
    expect(goal.keeperMotion['AWAY:keeper'].stage).toBe('land')
  })
  it.each(['wide', 'block'] as const)('does not dive for a %s shot', outcome => {
    const { initial, events } = fixture(outcome)
    expect(replayFrame(events, initial, 1.9).keeperMotion).toEqual({})
    expect(replayFrame(events, initial, 2.2).shotActive).toBe(false)
  })
  it('lands, recovers, and returns continuously to the engine frame', () => {
    const { initial, events } = fixture()
    const recovery = replayFrame(events, initial, 2.5)
    expect(recovery.keeperMotion['AWAY:keeper'].stage).toBe('recover')
    const before = replayFrame(events, initial, 2.8 - 0.00001)
    const after = replayFrame(events, initial, 2.8 + 0.00001)
    expect(before.snapshot!.ball.x).toBeCloseTo(after.snapshot!.ball.x, 3)
    expect(before.loft).toBeCloseTo(0)
    expect(after.keeperMotion).toEqual({})
    expect(after.snapshot!.carrierKey).toBe('AWAY:keeper')
  })
  it('is deterministic when paused, and stops on halftime and terminal states', () => {
    const { initial, events } = fixture()
    expect(replayFrame(events, initial, 2.1)).toEqual(replayFrame(events, initial, 2.1))
    expect(replayFrame(events, initial, 2.1, true).keeperMotion).toEqual({})
    for (const status of ['HALF_TIME', 'FULL_TIME', 'ABANDONED'] as const) {
      events[1].snapshot = { ...events[1].snapshot!, status }
      expect(replayFrame(events, initial, 2.1).keeperMotion).toEqual({})
    }
  })
  it('supports older shot events without ball-motion metadata', () => {
    const { initial, events } = fixture()
    events[0].ballMotion = undefined
    expect(replayFrame(events, initial, 1.9).shotActive).toBe(true)
    expect(replayFrame(events, initial, 2).keeperMotion['AWAY:keeper'].rotation).toBe(-72)
  })
  it('keeps a parry animation when the save shares a timestamp with restart setup', () => {
    const { initial, events } = fixture()
    events.splice(2, 0, { minute: 2, type: 'restart_setup', team: 'home', player: 'Shooter', detail: 'Corner',
      snapshot: { ...initial, status: 'STOPPAGE', ball: { x: 96, y: 4 } } })
    expect(replayFrame(events, initial, 2.1).keeperMotion['AWAY:keeper'].stage).toBe('land')
    expect(replayFrame(events, initial, 2.8 + 0.00001).snapshot!.status).toBe('STOPPAGE')
  })
  it('blends into a revealed kickoff without snapping at the end of recovery', () => {
    const { initial, events } = fixture('goal')
    events.splice(2, 0, { minute: 2.4, type: 'kickoff', team: 'away', player: 'Keeper', detail: 'Kickoff',
      snapshot: { ...initial, phase: 'RESTART', ball: { x: 50, y: 50 } } })
    const before = replayFrame(events, initial, 2.8 - 0.00001)
    const after = replayFrame(events, initial, 2.8 + 0.00001)
    expect(before.snapshot!.ball.x).toBeCloseTo(after.snapshot!.ball.x, 3)
  })
  it('uses opposite dive directions for targets on either side of the keeper', () => {
    const far = fixture('save', 1, 1, 42), near = fixture('save', 1, 1, 58)
    const farPose = replayFrame(far.events, far.initial, 2).keeperMotion['AWAY:keeper']
    const nearPose = replayFrame(near.events, near.initial, 2).keeperMotion['AWAY:keeper']
    expect(farPose.diveSide).toBe(-1)
    expect(nearPose.diveSide).toBe(1)
    expect(farPose.rotation).toBeLessThan(0)
    expect(nearPose.rotation).toBeGreaterThan(0)
  })
  it('makes a central reach for a shot directly at the keeper', () => {
    const { initial, events } = fixture('save', 1, 1, 51.4)
    const motion = replayFrame(events, initial, 2).keeperMotion['AWAY:keeper']
    expect(motion.diveSide).toBe(0)
    expect(motion.rotation).toBe(0)
    expect(motion.bodyScale).toBe(1)
  })
  it('intercepts the shot line and keeps goals at their selected target', () => {
    const saved = fixture('save', 1, 1, 58)
    const contact = replayFrame(saved.events, saved.initial, 2).snapshot!.ball
    expect((contact.y - 45) / (58 - 45)).toBeCloseTo((contact.x - 75) / (98 - 75))
    const scored = fixture('goal', 1, 1, 58)
    expect(replayFrame(scored.events, scored.initial, 2.2).snapshot!.ball.y).toBe(58)
  })
  it('keeps the scored ball in its selected net lane after goalkeeper recovery', () => {
    const { initial, events } = fixture('goal', 1, 1, 58)
    const frame = replayFrame(events, initial, 3)
    const html = renderToStaticMarkup(createElement(MatchPitch, { snapshot: frame.snapshot!, frame, minute: 3,
      event: events[1], homeName: 'Home', awayName: 'Away' }))
    const point = projectPitch({ x: 103, y: 58 }, 5)
    expect(html).toContain(`translate(${point.x} ${point.y}) scale(${point.scale})`)
  })
})
