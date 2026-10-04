import type { PitchPoint, ReplayPlayer, ReplaySnapshot } from '@footballsimsim/shared'
import type { MatchEvent } from './types'
import { projectPitch } from './pitch-geometry'

export type GoalkeeperMotion = {
  stage: 'prepare' | 'reach' | 'land' | 'recover'
  rotation: number
  bodyScale: number
  diveSide: -1 | 0 | 1
  handY: number
  offset: PitchPoint
  mobileOffset: PitchPoint
  shadow: PitchPoint
  mobileShadow: PitchPoint
  extension: number
  crouch: number
}

const clamp = (value: number) => Math.min(1, Math.max(0, value))
const ease = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t) }
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const pointBetween = (a: PitchPoint, b: PitchPoint, t: number): PitchPoint => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) })

export const KEEPER_RECOVERY_SECONDS = 0.8

export type ShotAnimation = {
  ball: PitchPoint
  loft: number
  from: PitchPoint
  flight: number
  shooter?: ReplayPlayer
  keeper: ReplayPlayer
  keeperActive: boolean
  motion: GoalkeeperMotion
  airborne: boolean
}

// A presentation sequence around an unchanged engine timestamp. Only save/goal
// groups merit a dive; blocks and wide shots never trigger one automatically.
export function shotAnimation(events: MatchEvent[], initial: ReplaySnapshot | undefined, minute: number,
  visibleCount: number, snapshot: ReplaySnapshot | undefined, holdHalfTime: boolean): ShotAnimation | undefined {
  if (!snapshot || holdHalfTime || ['HALF_TIME', 'FULL_TIME', 'ABANDONED'].includes(snapshot.status)) return
  let shotIndex = -1
  // Prefer an upcoming attempt once its flight window starts. Otherwise finish
  // the previous landing, even when a same-time restart setup follows the save.
  for (let index = visibleCount; index < events.length && events[index]!.minute === events[visibleCount]?.minute; index++) {
    if (events[index]!.type === 'shot') shotIndex = index
  }
  if (shotIndex < 0) for (let index = visibleCount - 1; index >= 0; index--) {
    if (minute - events[index]!.minute > KEEPER_RECOVERY_SECONDS) break
    if (events[index]!.type === 'shot') { shotIndex = index; break }
  }
  if (shotIndex < 0) return
  const shot = events[shotIndex]!
  if (!shot.snapshot || shot.snapshot.period !== snapshot.period) return
  let first = shotIndex, last = shotIndex
  while (first > 0 && events[first - 1]!.minute === shot.minute) first--
  while (last + 1 < events.length && events[last + 1]!.minute === shot.minute) last++
  const group = events.slice(first, last + 1)
  const outcome = group.find(event => event.type === 'save' || event.type === 'goal')
  if (!outcome?.snapshot || group.some(event => ['block', 'half_time', 'full_time', 'match_abandoned'].includes(event.type))) return
  const attackingTeam = shot.team === 'home' ? 'HOME' : 'AWAY'
  const keeper = shot.snapshot.players.find(player => player.role === 'GK' && player.team !== attackingTeam)
  if (!keeper || !snapshot.players.some(player => player.key === keeper.key)) return
  const previous = events[first - 1]
  const before = previous?.snapshot ?? initial
  const start = previous?.minute ?? 0
  const duration = shot.minute - start
  if (!before || duration <= 0) return
  const shooter = shot.snapshot.players.find(player => player.playerId === shot.playerId && player.team === attackingTeam)
    ?? shot.snapshot.players.find(player => player.key === before.carrierKey && player.team === attackingTeam)
  const release = shot.ballMotion?.kind === 'SHOT' ? shot.ballMotion.from : shooter ?? before.ball
  const attackDirection = shot.snapshot.direction[attackingTeam]
  const trajectory = shot.ballMotion?.kind === 'SHOT' ? shot.ballMotion : undefined
  const target = trajectory?.to ?? outcome.snapshot.ball
  // Intercept the actual shot line at the keeper's position. The goal's
  // sides run along pitch y, not screen x; perspective determines the pose.
  const intercept = trajectory && Math.abs(target.x - release.x) > 0.001
    ? clamp((keeper.x - release.x) / (target.x - release.x)) : undefined
  const contact: PitchPoint = intercept !== undefined ? pointBetween(release, target, intercept)
    : { x: keeper.x - attackDirection * 4.5, y: Math.min(58, Math.max(42, shot.snapshot.ball.y)) }
  const lateral = contact.y - keeper.y
  const diveSide: -1 | 0 | 1 = trajectory ? Math.abs(lateral) < 1.25 ? 0 : lateral > 0 ? 1 : -1 : 0
  const travel = Math.min(duration, Math.min(0.55, 0.28 + Math.hypot(release.x - contact.x, (release.y - contact.y) * 0.65) / 180))
  const kick = shot.minute - travel
  const elapsed = minute - shot.minute
  if (elapsed >= KEEPER_RECOVERY_SECONDS) return
  const flight = clamp((minute - kick) / travel)
  const launch = ease((flight - 0.25) / 0.75)
  const recovery = ease((elapsed - 0.25) / (KEEPER_RECOVERY_SECONDS - 0.25))
  const extension = elapsed < 0 ? launch : 1 - recovery
  const anchor = projectPitch(keeper)
  const groundReach = projectPitch({ x: keeper.x, y: contact.y })
  const projectedAngle = Math.atan2(groundReach.x - anchor.x, -(groundReach.y - anchor.y)) * 180 / Math.PI
  // Foreshorten a dive along the depth axis. Keep the far-side push-off legible
  // while limiting tilt so a near-side dive never flips the figure upside down.
  const depthAngle = Math.sign(projectedAngle || diveSide * attackDirection) * Math.max(55, Math.min(85, Math.abs(projectedAngle)))
  const peakAngle = trajectory ? diveSide === 0 ? 0 : depthAngle : -attackDirection * 72
  const peakScale = trajectory && diveSide !== 0 ? 0.68 : 1
  const rotation = peakAngle * extension
  const bodyScale = mix(1, peakScale, extension)
  const radians = peakAngle * Math.PI / 180
  const ballHeight = trajectory && diveSide === 0 ? 22 : 15
  const handY = trajectory && diveSide === 0 ? -22 : -57
  const armLength = -(handY + 17) * peakScale
  const reach = projectPitch(contact, ballHeight)
  // At full extension the gloved hands meet the rendered ball exactly. The
  // body rotates around its hips; its ground shadow remains at the feet.
  const peakOffset = {
    x: (reach.x - anchor.x) / anchor.scale - armLength * Math.sin(radians),
    y: (reach.y - anchor.y) / anchor.scale + 17 + armLength * Math.cos(radians),
  }
  const mobilePeak = {
    x: (reach.x - anchor.x) / anchor.scale / 1.25 - armLength * Math.sin(radians),
    y: (reach.y - anchor.y) / anchor.scale / 1.25 + 17 + armLength * Math.cos(radians),
  }
  const landing = elapsed > 0 ? Math.sin(Math.PI * clamp(elapsed / KEEPER_RECOVERY_SECONDS)) * 6 : 0
  const motion: GoalkeeperMotion = {
    stage: flight < 0.25 && elapsed < 0 ? 'prepare' : elapsed < 0 ? 'reach' : elapsed < 0.25 ? 'land' : 'recover',
    rotation,
    bodyScale,
    diveSide,
    handY,
    offset: { x: peakOffset.x * extension, y: peakOffset.y * extension + landing },
    mobileOffset: {
      x: mobilePeak.x * extension,
      y: mobilePeak.y * extension + landing,
    },
    shadow: { x: (peakOffset.x + 10 * peakScale * Math.sin(radians)) * extension,
      y: (peakOffset.y - 17 - 10 * peakScale * Math.cos(radians) + ballHeight) * extension },
    mobileShadow: { x: (mobilePeak.x + 10 * peakScale * Math.sin(radians)) * extension * 1.25,
      y: (mobilePeak.y - 17 - 10 * peakScale * Math.cos(radians)) * extension * 1.25 + ballHeight * extension },
    extension,
    crouch: elapsed < 0 ? Math.sin(Math.PI * clamp(flight / 0.5)) * (1 - launch) * 3 : recovery * (1 - recovery) * 5,
  }
  const outcomeBall = outcome.type === 'goal' && trajectory ? target : outcome.snapshot.ball
  const end = outcome.type === 'save' ? contact : outcomeBall
  const hold = pointBetween(before.ball, release, ease((minute - start) / Math.max(0.001, kick - start)))
  let ball = flight === 0 ? hold : pointBetween(release, end, mix(flight, ease(flight), 0.1))
  let height = flight === 0 ? 5 : mix(5, ballHeight, flight)
  if (elapsed >= 0) {
    if (outcome.type === 'goal') {
      ball = { ...outcomeBall, x: outcomeBall.x + attackDirection * 5 * (1 - (1 - clamp(elapsed / 0.25)) ** 3) }
      height = mix(ballHeight, 5, ease(elapsed / 0.25))
      // Once the restart is revealed, blend into its ball position rather than
      // holding the scoring ball through kickoff and snapping at recovery end.
      if (events[visibleCount - 1]?.type !== 'goal') {
        ball = pointBetween(ball, snapshot.ball, ease((elapsed - 0.25) / (KEEPER_RECOVERY_SECONDS - 0.25)))
      }
    } else {
      ball = pointBetween(contact, snapshot.ball, ease(elapsed / KEEPER_RECOVERY_SECONDS))
      height = mix(ballHeight, 5, ease(elapsed / KEEPER_RECOVERY_SECONDS))
    }
  }
  const priorKeeper = before.players.find(player => player.key === keeper.key) ?? keeper
  const keeperPosition = elapsed < 0 ? pointBetween(priorKeeper, keeper, ease((minute - start) / Math.max(0.001, kick - start)))
    : pointBetween(keeper, snapshot.players.find(player => player.key === keeper.key) ?? keeper, recovery)
  const priorShooter = shooter && before.players.find(player => player.key === shooter.key)
  const shooterPosition = shooter && elapsed < 0 ? { ...shooter, ...pointBetween(priorShooter ?? shooter, shooter,
    ease((minute - start) / Math.max(0.001, kick - start))) } : undefined
  return { ball, loft: (height - 5) / 125, from: release, flight, shooter: shooterPosition,
    keeper: { ...keeper, ...keeperPosition }, keeperActive: minute >= kick - Math.min(0.12, travel * 0.5),
    motion, airborne: minute >= kick }
}

export function goalkeeperPose(motion: GoalkeeperMotion) {
  const reach = motion.extension
  const central = motion.handY === -22
  const hands = [-1, 1].map(side => ({ x: side * mix(11, 4, reach), y: mix(-21, motion.handY, reach) }))
  const arms = hands.map((hand, index) => {
    const side = index === 0 ? -1 : 1
    return `M${side * 9},-32 L${side * mix(12, 9, reach)},${mix(-25, central ? -28 : -43, reach)} L${hand.x},${hand.y}`
  }).join(' ')
  const legs = [-1, 1].map(side => {
    const kneeX = side * (4 + reach * 4), footX = side * (4 + reach * 8)
    const footY = -1 - reach * (side === -1 ? 3 : 1)
    return { side, path: `M${side * 4},-14 L${kneeX},${-8 - reach * 2} L${footX},${footY}`,
      boot: `M${footX},${footY} h${side * 4}` }
  })
  return { hands, arms, legs, lean: 0, bob: -motion.crouch }
}
