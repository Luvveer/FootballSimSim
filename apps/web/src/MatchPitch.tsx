import { useId } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import type { OffsideDecision, PitchPoint, ReplayPlayer, ReplaySnapshot } from '@footballsimsim/shared'
import type { MatchEvent } from './types'
import { replayFrame, type ReplayPlayerMotion } from './replay'
import { GOAL, PITCH_VIEW, goalBallPosition, goalGeometry, pitchCircle, pitchPolygon, projectPitch } from './pitch-geometry'
import './MatchPitch.css'
import { BALL_RADIUS, ballRollDegrees, rollingBallPanels } from './ball-appearance'

type Props = {
  snapshot: ReplaySnapshot
  frame: ReturnType<typeof replayFrame>
  minute: number
  event?: MatchEvent
  celebration?: MatchEvent
  decision?: OffsideDecision
  homeName: string
  awayName: string
}

const field = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
const box = (end: 0 | 100, length: number, halfWidth: number) => pitchPolygon([
  { x: end, y: 50 - halfWidth }, { x: end === 0 ? length : 100 - length, y: 50 - halfWidth },
  { x: end === 0 ? length : 100 - length, y: 50 + halfWidth }, { x: end, y: 50 + halfWidth },
])

function GroundLine({ from, to, className }: { from: PitchPoint; to: PitchPoint; className?: string }) {
  const a = projectPitch(from), b = projectPitch(to)
  return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={className}/>
}

function Goal({ end, front = false, celebrating = false }: { end: 0 | 100; front?: boolean; celebrating?: boolean }) {
  const { mouth, back, footprint } = goalGeometry(end)
  const a = projectPitch(mouth[0]), b = projectPitch(mouth[1])
  const topA = projectPitch(mouth[0], GOAL.height), topB = projectPitch(mouth[1], GOAL.height)
  if (front) return <g className="pitch-goal-frame" data-end={end}>
    <path d={`M${a.x},${a.y} L${topA.x},${topA.y} L${topB.x},${topB.y} L${b.x},${b.y}`}/>
    <circle cx={a.x} cy={a.y} r="2"/><circle cx={b.x} cy={b.y} r="2"/>
  </g>
  const roof = [mouth[0], back[0], back[1], mouth[1]]
  return <g className={`pitch-goal-structure ${celebrating ? 'is-scoring' : ''}`} data-end={end}>
    <polygon points={pitchPolygon(footprint)} className="pitch-goal-floor"/>
    <polygon points={pitchPolygon(roof, GOAL.height)} className="pitch-goal-roof"/>
    <polygon points={`${pitchPolygon(back)} ${pitchPolygon([...back].reverse(), GOAL.height)}`} className="pitch-goal-netting"/>
    {mouth.map((point, index) => <polygon key={index} className="pitch-goal-netting" points={`${pitchPolygon([point, back[index]])} ${pitchPolygon([back[index], point], GOAL.height)}`}/>)}
    {Array.from({ length: 7 }, (_, index) => {
      const y = 40 + index * 20 / 6
      const start = projectPitch({ x: back[0].x, y }), top = projectPitch({ x: back[0].x, y }, GOAL.height)
      return <line key={`vertical-${index}`} x1={start.x} y1={start.y} x2={top.x} y2={top.y} className="pitch-net-thread"/>
    })}
    {[8, 16, 24, 31].map(height => <polyline key={height} points={pitchPolygon([mouth[0], back[0], back[1], mouth[1]], height)} className="pitch-net-thread"/>)}
    {Array.from({ length: 5 }, (_, index) => <polyline key={`roof-${index}`} points={pitchPolygon([
      { x: end, y: 40 + index * 5 }, { x: back[0].x, y: 40 + index * 5 },
    ], GOAL.height)} className="pitch-net-thread"/>)}
  </g>
}

function PlayerFigure({ player, motion, carrier, throwing }: {
  player: ReplayPlayer; motion?: ReplayPlayerMotion; carrier: boolean; throwing: boolean
}) {
  const position = projectPitch(player)
  const facing = motion?.facing ?? 1
  const activity = Math.min(1, motion?.activity ?? 0)
  const stride = (motion?.stride ?? 0) * activity * 8
  const lean = activity * facing * 3
  const parts = player.name.split(' ')
  const last = parts.at(-1) ?? player.name
  const surname = /^(Jr\.?|Sr\.?|II|III)$/.test(last) ? parts.slice(-2).join(' ') : last
  const name = surname.length > 16 ? `${surname.slice(0, 15)}…` : surname
  return <g transform={`translate(${position.x} ${position.y})`} className={`pitch-person ${player.team.toLowerCase()} ${player.role === 'GK' ? 'keeper' : ''} ${carrier ? 'has-ball' : ''}`} tabIndex={0} role="img" aria-label={`${player.name}, ${player.team === 'HOME' ? 'home' : 'away'}, ${player.slotId}, energy ${player.energy}%${carrier ? ', on the ball' : ''}${player.yellowCards ? ', yellow card' : ''}`}>
    <g transform={`scale(${position.scale})`}>
      <ellipse className="pitch-person-shadow" cx="3" cy="2" rx="15" ry="5"/>
      <g className="pitch-figure-body">
        <g className="pitch-movement-pose" transform={`translate(${lean} ${-activity * Math.abs(stride) * 0.12})`}>
          <path className="pitch-limb" d={`M-5,-15 L${-7 - stride},-6 L${-8 - stride},-1 M5,-15 L${7 + stride},-6 L${9 + stride},-1`}/>
          <path className="pitch-boot" d={`M${-8 - stride},-1 h${-5 * facing} M${9 + stride},-1 h${5 * facing}`}/>
          <path className="pitch-arm" d={throwing ? 'M-9,-32 L-16,-43 L-5,-51 M9,-32 L16,-43 L5,-51' : `M-9,-32 L${-15 + stride},-23 L${-14 + stride},-18 M9,-32 L${15 - stride},-25 L${16 - stride},-20`}/>
          <path className="pitch-shirt" d="M-6,-37 L-13,-32 L-10,-26 L-8,-28 L-8,-17 Q0,-14 8,-17 L8,-28 L10,-26 L13,-32 L6,-37 Z"/>
          <path className="pitch-shirt-detail" d="M-8,-27 H8 M-3,-37 Q0,-32 3,-37"/>
          <path className="pitch-shorts" d="M-8,-18 H8 L9,-12 H2 L0,-16 L-2,-12 H-9 Z"/>
          <circle className="pitch-head" cx="0" cy="-44" r="6.5"/>
          <path className="pitch-hair" d="M-6,-45 Q-5,-53 2,-50 Q6,-49 6,-44 L3,-46 L-5,-45 Z"/>
          {player.yellowCards > 0 && <rect className="pitch-yellow-card" x="13" y="-40" width="5" height="8" rx="1"/>}
        </g>
      </g>
    </g>
    {carrier && <g className="pitch-name-label" transform="translate(0 -88)" aria-hidden="true">
      <rect x={-Math.max(23, name.length * 4.1 + 8)} y="10" width={Math.max(46, name.length * 8.2 + 16)} height="21" rx="5"/>
      <text textAnchor="middle" y="25">{name}</text>
      <path className="pitch-energy-base" d="M-12,35 H12"/>
      <path className="pitch-energy-fill" d={`M-12,35 H${-12 + 24 * Math.min(100, Math.max(0, player.energy)) / 100}`}/>
    </g>}
  </g>
}

function Ball({ point, loft, rotation, direction }: { point: PitchPoint; loft: number; rotation: number; direction: PitchPoint }) {
  const ground = projectPitch(point), air = projectPitch(point, loft * 125 + 5)
  return <g className="pitch-football" aria-hidden="true">
    <ellipse className="pitch-ball-shadow" cx={ground.x + 3} cy={ground.y + 2} rx={5.5 + loft * 10} ry={2.6 + loft * 3} opacity={0.5 - loft * 0.8}/>
    <g transform={`translate(${air.x} ${air.y}) scale(${ground.scale})`}>
      <circle className="pitch-ball-surface" r={BALL_RADIUS}/>
      {rollingBallPanels(rotation, direction).map((points, index) => <polygon key={index} className="pitch-ball-panels" points={points}/>)}
      <circle className="pitch-ball-shine" cx="-2" cy="-2.5" r="2"/>
      <circle className="pitch-ball-outline" r={BALL_RADIUS}/>
    </g>
  </g>
}

export function MatchPitch({ snapshot, frame, minute, event, celebration, decision, homeName, awayName }: Props) {
  const id = useId().replaceAll(':', '')
  const homeDirection = snapshot.direction.HOME
  const scoringDirection = celebration?.snapshot?.direction[celebration.team === 'home' ? 'HOME' : 'AWAY'] ?? (celebration?.team === 'home' ? homeDirection : -homeDirection)
  const ballPoint = event?.type === 'goal' && snapshot.phase === 'GOAL'
    ? goalBallPosition(snapshot.ball, snapshot.direction[event.team === 'home' ? 'HOME' : 'AWAY'], minute - event.minute)
    : snapshot.ball
  const players = [...snapshot.players].sort((a, b) => a.y - b.y)
  const title = `${snapshot.possession === 'HOME' ? homeName : awayName} possession. ${event?.detail ?? 'Kick off'}`
  return <figure className={`match-pitch ${celebration ? 'is-goal' : ''}`}>
    <svg className="match-pitch-scene" viewBox={`${PITCH_VIEW.x} ${PITCH_VIEW.y} ${PITCH_VIEW.width} ${PITCH_VIEW.height}`} role="group" aria-label={title}>
      <defs>
        <radialGradient id={`${id}-ground`}><stop offset="0" stopColor="var(--pitch-ground-light)"/><stop offset="1" stopColor="var(--pitch-ground)"/></radialGradient>
        <linearGradient id={`${id}-grass`} x2="0" y2="1"><stop stopColor="var(--pitch-grass-far)"/><stop offset="1" stopColor="var(--pitch-grass-near)"/></linearGradient>
        <clipPath id={`${id}-field`}><polygon points={pitchPolygon(field)}/></clipPath>
      </defs>
      <rect width="1000" height="600" fill={`url(#${id}-ground)`}/>
      <ellipse cx="505" cy="420" rx="430" ry="105" className="pitch-ground-shadow"/>
      <polygon points={`${pitchPolygon([field[3], field[2]])} ${pitchPolygon([field[2], field[3]], -16)}`} className="pitch-turf-edge"/>
      <polygon points={`${pitchPolygon([field[1], field[2]])} ${pitchPolygon([field[2], field[1]], -16)}`} className="pitch-turf-side"/>
      <polygon points={pitchPolygon(field)} fill={`url(#${id}-grass)`}/>
      <g clipPath={`url(#${id}-field)`}>
        {Array.from({ length: 10 }, (_, index) => <polygon key={index} className={index % 2 ? 'pitch-mow-light' : 'pitch-mow-dark'} points={pitchPolygon([
          { x: index * 10, y: 0 }, { x: (index + 1) * 10, y: 0 }, { x: (index + 1) * 10, y: 100 }, { x: index * 10, y: 100 },
        ])}/>)}
        <g className="pitch-markings">
          <polygon points={pitchPolygon(field)}/>
          <GroundLine from={{ x: 50, y: 0 }} to={{ x: 50, y: 100 }}/>
          <polygon points={pitchCircle({ x: 50, y: 50 }, 8.7)}/>
          {[0, 100].map(end => <g key={end}>
            <polyline points={box(end as 0 | 100, 16, 29)}/>
            <polyline points={box(end as 0 | 100, 5.5, 14)}/>
            <polygon points={pitchCircle({ x: end === 0 ? 11 : 89, y: 50 }, 0.4)} className="pitch-marking-dot"/>
          </g>)}
          <polygon points={pitchCircle({ x: 50, y: 50 }, 0.5)} className="pitch-marking-dot"/>
          {field.map((corner, index) => <polygon key={index} points={pitchCircle(corner, 1, 1.5)}/>)}
        </g>
        {decision && <g className={`pitch-offside ${decision.offside ? 'flagged' : 'onside'}`}>
          <GroundLine from={{ x: decision.lineX, y: 0 }} to={{ x: decision.lineX, y: 100 }}/>
        </g>}
      </g>
      <Goal end={0} celebrating={!!celebration && scoringDirection === -1}/>
      <Goal end={100} celebrating={!!celebration && scoringDirection === 1}/>
      {[...players.map(player => ({ kind: 'player' as const, depth: player.y, player })), { kind: 'ball' as const, depth: ballPoint.y }]
        .sort((a, b) => a.depth - b.depth)
        .map(item => item.kind === 'ball' ? <Ball key="ball" point={ballPoint} loft={frame.loft} rotation={frame.rotation + ballRollDegrees(snapshot.ball, ballPoint)} direction={frame.rollDirection}/>
          : <PlayerFigure key={item.player.key} player={item.player} motion={frame.playerMotion[item.player.key]} carrier={item.player.key === snapshot.carrierKey} throwing={snapshot.restart?.type === 'THROW_IN' && snapshot.restart.takerKey === item.player.key && snapshot.restart.ready}/>)}
      <Goal end={0} front/><Goal end={100} front/>
      {decision && <g className={`pitch-offside-label ${decision.offside ? 'flagged' : 'onside'}`}><rect x="390" y="44" width="220" height="32" rx="6"/><text x="500" y="65" textAnchor="middle">At the pass · {decision.offside ? 'Offside' : 'Onside'}</text></g>}
      {celebration && <g className="pitch-score-callout" aria-hidden="true"><text x="500" y="555" textAnchor="middle">GOAL · {celebration.player}</text></g>}
    </svg>
    <figcaption className="match-pitch-legend"><span className="home"><i/>{homeName}{homeDirection === 1 ? <ArrowRight/> : <ArrowLeft/>}</span><span className="pitch-view-label">Angled Match View</span><span className="away">{homeDirection === 1 ? <ArrowLeft/> : <ArrowRight/>}{awayName}<i/></span></figcaption>
  </figure>
}
