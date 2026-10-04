import type { PitchPoint, ReplaySnapshot } from '@footballsimsim/shared'
import type { MatchEvent, MatchResult } from './types'

export function matchTimeline(result: MatchResult, elapsed: number) {
  const duration = result.durationMinutes ?? 90
  const progress = Math.min(1, Math.max(0, elapsed / 60))
  return { minute: progress * duration, progress, half: (result.halfTimeMinute ?? duration / 2) / duration }
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

// Event results are revealed at their timestamp. Movement fills the time between
// those timestamps, so pause and speed controls share the same animation clock.
export function replayFrame(events: MatchEvent[], initial: ReplaySnapshot | undefined, minute: number) {
  let low = 0, high = events.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (events[middle]!.minute <= minute) low = middle + 1
    else high = middle
  }
  const visibleCount = low
  let rotation = 0
  let priorBall = initial?.ball
  for (let index = 0; index < visibleCount; index++) {
    if (index + 1 < visibleCount && events[index + 1]!.minute === events[index]!.minute) continue
    const ball = events[index]!.snapshot?.ball
    if (priorBall && ball) rotation += Math.hypot(ball.x - priorBall.x, ball.y - priorBall.y) * 9
    if (ball) priorBall = ball
  }
  const latest = events[visibleCount - 1]
  const from = latest?.snapshot ?? initial
  let targetIndex = visibleCount
  // An interception or save can share a timestamp with the action that caused it.
  // Animate to the resolved position instead of snapping through both positions.
  while (targetIndex + 1 < events.length && events[targetIndex + 1]!.minute === events[visibleCount]?.minute) targetIndex++
  const next = events[targetIndex]
  const startMinute = latest?.minute ?? 0
  const duration = next ? next.minute - startMinute : 0
  const progress = duration > 0 ? Math.min(1, Math.max(0, (minute - startMinute) / duration)) : 1
  if (!from || !next?.snapshot || !duration) return { visibleCount, snapshot: from, path: undefined, rotation }
  const to = next.snapshot
  // A half-time break holds the pitch until the new kickoff. Do not animate
  // players through one another as the two teams change ends.
  if (from.status === 'HALF_TIME' || from.status === 'FULL_TIME' || from.status === 'ABANDONED') return { visibleCount, snapshot: from, path: undefined, rotation }
  const movement = smooth(progress)
  const flight = smooth(Math.min(1, Math.max(0, (progress - 0.08) / 0.84)))
  const distance = Math.hypot(to.ball.x - from.ball.x, to.ball.y - from.ball.y)
  // Small passing arc, with both endpoints exactly on the engine's ball positions.
  const curve = next.type === 'pass' ? Math.sin(Math.PI * flight) * Math.min(2, distance / 12) : 0
  const ball: PitchPoint = { x: mix(from.ball.x, to.ball.x, flight), y: mix(from.ball.y, to.ball.y, flight) - curve }
  const destinations = new Map(to.players.map(player => [player.key, player]))
  return {
    visibleCount,
    snapshot: { ...from, ball, players: from.players.map(player => {
      const target = destinations.get(player.key) ?? player
      return { ...player, x: mix(player.x, target.x, movement), y: mix(player.y, target.y, movement) }
    }) },
    path: distance > 3 ? { from: from.ball, to: to.ball, progress: flight } : undefined,
    rotation: rotation + distance * flight * 9,
  }
}
