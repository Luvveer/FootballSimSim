import type { PitchPoint, ReplaySnapshot } from '@footballsimsim/shared'
import type { MatchEvent, MatchResult } from './types'
import { ballRollDegrees } from './ball-appearance'
import { projectPitch } from './pitch-geometry'
import { shotAnimation, type GoalkeeperMotion } from './goalkeeper-animation'

export const HALF_TIME_BREAK_SECONDS = 5

export function replayTiming(result: MatchResult) {
  const duration = result.durationMinutes ?? 90
  const halfTime = result.halfTimeMinute ?? (result.regulationMinutes ?? 90) / 2
  const hasHalfTime = result.events?.some(event=>event.type==='half_time') || (result.status!=='ABANDONED' && duration>=halfTime*2)
  const breakSeconds = hasHalfTime ? HALF_TIME_BREAK_SECONDS : 0
  return { duration, halfTime, breakSeconds, totalSeconds:duration+breakSeconds }
}

export function matchTimeline(result: MatchResult, elapsed: number) {
  const {duration,halfTime,breakSeconds,totalSeconds}=replayTiming(result)
  const seconds=Math.max(0,Math.min(totalSeconds,elapsed))
  const inHalfTime=breakSeconds>0 && seconds>=halfTime && seconds<halfTime+breakSeconds
  const minute=Math.min(duration,seconds<halfTime?seconds:inHalfTime?halfTime:seconds-breakSeconds)
  // The bar has two equal halves. Each fills over its 45 regulation minutes and then holds while added time is played,
  // so the half-time marker is always in the middle.
  const regulationHalf=(result.regulationMinutes ?? 90)/2
  const filled=(playedMinutes:number)=>Math.min(1,Math.max(0,playedMinutes/regulationHalf))
  const progress=minute<=halfTime ? 0.5*filled(minute) : 0.5+0.5*filled(minute-halfTime)
  return { minute, progress, half:0.5, inHalfTime,
    breakRemaining:inHalfTime?halfTime+breakSeconds-seconds:0, complete:seconds>=totalSeconds,
    period:(seconds>=halfTime+breakSeconds?2:1) as 1|2, totalSeconds }
}

// Playback speed affects play; the interval between halves is five real
// seconds at every speed. Split a tick at each boundary to avoid skipping it.
export function advanceReplayElapsed(result:MatchResult,elapsed:number,wallSeconds:number,speed:number) {
  const timing=replayTiming(result)
  let remaining=Math.max(0,wallSeconds),cursor=Math.min(timing.totalSeconds,Math.max(0,elapsed))
  const boundaries=timing.breakSeconds?[timing.halfTime,timing.halfTime+timing.breakSeconds,timing.totalSeconds]:[timing.totalSeconds]
  for(const boundary of boundaries) {
    if(cursor>=boundary) continue
    const rate=timing.breakSeconds>0 && cursor>=timing.halfTime && cursor<timing.halfTime+timing.breakSeconds?1:speed
    const needed=(boundary-cursor)/rate
    if(remaining<needed) return cursor+remaining*rate
    cursor=boundary;remaining-=needed
  }
  return timing.totalSeconds
}

export function playbackRemaining(result:MatchResult,elapsed:number,speed:number) {
  const {halfTime,breakSeconds,totalSeconds}=replayTiming(result)
  const breakLeft=Math.max(0,halfTime+breakSeconds-Math.max(halfTime,elapsed))
  return (Math.max(0,totalSeconds-elapsed)-breakLeft)/speed+breakLeft
}

export function matchClock(result: MatchResult, minute: number, period?: 1 | 2) {
  const half = (result.regulationMinutes ?? 90) / 2
  const secondHalf = period === 2 || (period === undefined && minute > (result.halfTimeMinute ?? half))
  const periodMinute = secondHalf ? minute - (result.halfTimeMinute ?? half) : minute
  const seconds = Math.floor(Math.max(0, periodMinute) * 60 + 0.00001)
  const format = (value: number) => `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`
  return periodMinute >= half ? `${secondHalf ? half * 2 : half}:00 +${format(seconds - Math.round(half * 60))}` : format(seconds + (secondHalf ? Math.round(half * 60) : 0))
}

const mix = (start: number, end: number, amount: number) => start + (end - start) * amount
const smooth = (value: number) => value * value * (3 - 2 * value)

export interface ReplayPlayerMotion {
  facing: 1 | -1
  direction: PitchPoint
  activity: number
  phase: number
}

// Event results are revealed at their timestamp. Movement fills the time between
// those timestamps, so pause and speed controls share the same animation clock.
function baseReplayFrame(events: MatchEvent[], initial: ReplaySnapshot | undefined, minute: number, holdHalfTime = false) {
  const halfIndex=holdHalfTime?events.findIndex(event=>event.type==='half_time'):-1
  let low = 0, high = halfIndex>=0?halfIndex+1:events.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (events[middle]!.minute <= minute) low = middle + 1
    else high = middle
  }
  const visibleCount = low
  let rotation = 0
  let rollDirection: PitchPoint = { x: 1, y: 0 }
  let priorBall = initial?.ball
  let priorPlayers = initial?.players
  let priorPeriod = initial?.period
  const playerTravel = new Map<string, number>()
  for (let index = 0; index < visibleCount; index++) {
    if (index + 1 < visibleCount && events[index + 1]!.minute === events[index]!.minute) continue
    const players = events[index]!.snapshot?.players
    if (priorPlayers && players) {
      const previous = new Map(priorPlayers.map(player => [player.key, player]))
      // Changing ends is a scene reset, not a sprint across the field.
      const sceneReset = events[index]!.snapshot?.period !== priorPeriod
        || events[index]!.snapshot?.status === 'HALF_TIME'
      if (!sceneReset) for (const player of players) {
        const old = previous.get(player.key)
        if (old) playerTravel.set(player.key, (playerTravel.get(player.key) ?? 0)
          + Math.hypot((player.x - old.x) * 1.05, (player.y - old.y) * 0.68))
      }
    }
    if (players) {
      priorPlayers = players
      priorPeriod = events[index]!.snapshot?.period
    }
    const ball = events[index]!.snapshot?.ball
    if (priorBall && ball) {
      rotation += ballRollDegrees(priorBall, ball)
      const a = projectPitch(priorBall), b = projectPitch(ball)
      if (Math.hypot(b.x-a.x, b.y-a.y) > 0.001) rollDirection = { x: b.x-a.x, y: b.y-a.y }
    }
    if (ball) priorBall = ball
  }
  const latest = events[visibleCount - 1]
  const from = latest?.snapshot ?? initial
  let targetIndex = visibleCount
  // An interception or save can share a timestamp with the action that caused it.
  // Animate to the resolved position instead of snapping through both positions.
  while (targetIndex + 1 < events.length && events[targetIndex + 1]!.minute === events[visibleCount]?.minute) targetIndex++
  // Half-time and the next kickoff share a timestamp in game time. Never
  // interpolate to the switched ends before the half-time break has begun.
  const halfInGroup=events.slice(visibleCount,targetIndex+1).findIndex(event=>event.type==='half_time')
  if(halfInGroup>=0) targetIndex=visibleCount+halfInGroup
  const next = events[targetIndex]
  const startMinute = latest?.minute ?? 0
  const duration = next ? next.minute - startMinute : 0
  const progress = duration > 0 ? Math.min(1, Math.max(0, (minute - startMinute) / duration)) : 1
  const still = { visibleCount, snapshot: from, path: undefined, rotation, baseRotation: rotation, rollDirection, loft: 0, playerMotion: {} as Record<string, ReplayPlayerMotion> }
  if (!from || !next?.snapshot || !duration) return still
  const to = next.snapshot
  // A half-time break holds the pitch until the new kickoff. Do not animate
  // players through one another as the two teams change ends.
  if (from.status === 'HALF_TIME' || from.status === 'FULL_TIME' || from.status === 'ABANDONED') return still
  const movement = smooth(progress)
  const destinations = new Map(to.players.map(player => [player.key, player]))
  // Keep the initiating pass when its result (e.g. an interception) shares the
  // timestamp. Ball travel and decision cadence are separate animation timings.
  const pass = events.slice(visibleCount, targetIndex + 1).find(event => event.type === 'pass')
  const throwing = pass?.ballMotion?.kind === 'THROW_IN'
  const carrier = from.status === 'PLAY' && from.phase !== 'SHOT' && from.phase !== 'GOAL'
    ? from.players.find(player => player.key === from.carrierKey) : undefined
  const carriedBall = (amount: number): PitchPoint => {
    const target = carrier && destinations.get(carrier.key)
    return carrier && target ? {
      x: from.ball.x + (target.x - carrier.x) * amount,
      y: from.ball.y + (target.y - carrier.y) * amount,
    } : from.ball
  }
  const metres = Math.hypot((to.ball.x - from.ball.x) * 1.05, (to.ball.y - from.ball.y) * 0.68)
  // At 1x, a ground pass takes 0.24–0.65 seconds; a lofted throw takes up to
  // 0.8 seconds. Longer event intervals become possession before the kick,
  // rather than a ball drifting through the air for the entire interval.
  const travelTime = Math.min(duration, Math.min(throwing ? 0.8 : 0.65, (throwing ? 0.38 : 0.24) + metres / 130))
  const releaseTime = duration - travelTime
  const release = pass ? carriedBall(smooth(releaseTime / duration)) : from.ball
  const flightProgress = pass ? Math.max(0, Math.min(1, (minute - startMinute - releaseTime) / travelTime)) : progress
  // Mostly constant speed, with a gentle acceleration instead of a long ease-in.
  const flight = pass ? mix(flightProgress, smooth(flightProgress), 0.15) : smooth(progress)
  const distance = Math.hypot(to.ball.x - release.x, to.ball.y - release.y)
  // Small passing arc, with both endpoints exactly on the engine's ball positions.
  // Ground curvature is independent of altitude; the pitch renderer draws
  // the airborne ball above this position and its shadow at this position.
  const curve = pass && !throwing ? Math.sin(Math.PI * flight) * Math.min(1.5, distance / 20) : 0
  const ball: PitchPoint = pass && flightProgress === 0 ? carriedBall(movement)
    : { x: mix(release.x, to.ball.x, flight), y: mix(release.y, to.ball.y, flight) - curve }
  // Include dribbling before release. Normalize to the endpoint rotation so a
  // new event does not reset the panel phase when a curved pass arrives.
  const heldDistance = pass ? ballRollDegrees(from.ball, release) : 0
  const routeDistance = heldDistance + ballRollDegrees(release, to.ball)
  const traveled = pass && flightProgress === 0 ? ballRollDegrees(from.ball, ball)
    : heldDistance + ballRollDegrees(release, to.ball) * flight
  const rollProgress = routeDistance > 0 ? traveled / routeDistance : 0
  const a = projectPitch(from.ball), b = projectPitch(to.ball)
  if (Math.hypot(b.x-a.x, b.y-a.y) > 0.001) rollDirection = { x: b.x-a.x, y: b.y-a.y }
  return {
    visibleCount,
    snapshot: { ...from, ball, players: from.players.map(player => {
      const target = destinations.get(player.key) ?? player
      return { ...player, x: mix(player.x, target.x, movement), y: mix(player.y, target.y, movement) }
    }) },
    path: distance > 3 && (!pass || flightProgress > 0) ? { from: release, to: to.ball, progress: flight } : undefined,
    rotation: rotation + ballRollDegrees(from.ball, to.ball) * rollProgress,
    baseRotation: rotation,
    rollDirection,
    loft: throwing ? Math.sin(Math.PI*flight)*0.3 : 0,
    playerMotion: Object.fromEntries(from.players.map(player => {
      const target = destinations.get(player.key) ?? player
      const dx = target.x - player.x, dy = target.y - player.y
      const distance = Math.hypot(dx * 1.05, dy * 0.68)
      const point = { x: mix(player.x, target.x, movement), y: mix(player.y, target.y, movement) }
      const a = projectPitch(point), b = projectPitch({ x: point.x + dx * 0.001, y: point.y + dy * 0.001 })
      const screenDistance = Math.hypot(b.x - a.x, b.y - a.y)
      const direction = screenDistance > 0.0001
        ? { x: (b.x - a.x) / screenDistance, y: (b.y - a.y) / screenDistance }
        : { x: from.direction[player.team], y: 0 }
      // One cycle per eight metres keeps cadence proportional to travel. The
      // accumulated phase survives event boundaries and freezes with replay time.
      const offset = Array.from(player.key).reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0) % 628 / 100
      const phase = ((playerTravel.get(player.key) ?? 0) + distance * movement) * Math.PI * 2 / 8 + offset
      // Pose follows distance traveled, never an independent CSS clock.
      // These are movement cues, not engine-authored sprint claims.
      return [player.key, {
        facing: Math.abs(direction.x) > 0.05 ? (direction.x > 0 ? 1 : -1) : from.direction[player.team],
        direction,
        activity: Math.min(1, distance / duration / 9 * 6 * progress * (1 - progress)),
        phase,
      } satisfies ReplayPlayerMotion]
    })),
  }
}

export function replayFrame(events: MatchEvent[], initial: ReplaySnapshot | undefined, minute: number, holdHalfTime = false) {
  const frame = baseReplayFrame(events, initial, minute, holdHalfTime)
  const animation = shotAnimation(events, initial, minute, frame.visibleCount, frame.snapshot, holdHalfTime)
  const keeperMotion: Record<string, GoalkeeperMotion> = {}
  if (!animation || !frame.snapshot) return { ...frame, keeperMotion, shotActive: false }
  if (animation.keeperActive) keeperMotion[animation.keeper.key] = animation.motion
  const a = projectPitch(animation.from), b = projectPitch(animation.ball)
  return { ...frame,
    snapshot: { ...frame.snapshot, ball: animation.ball,
      carrierKey: animation.airborne ? undefined : frame.snapshot.carrierKey,
      players: frame.snapshot.players.map(player => player.key === animation.keeper.key ? { ...player, x: animation.keeper.x, y: animation.keeper.y }
        : player.key === animation.shooter?.key ? { ...player, x: animation.shooter.x, y: animation.shooter.y } : player),
    },
    loft: animation.loft,
    rotation: animation.airborne ? frame.rotation : frame.baseRotation,
    rollDirection: { x: b.x - a.x, y: b.y - a.y },
    keeperMotion,
    shotActive: true,
  }
}
