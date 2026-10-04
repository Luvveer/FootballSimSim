import { useEffect, useMemo, useRef, useState } from 'react'
import { simulateMatch } from '@footballsimsim/simulation'
import type { MatchConfig } from '@footballsimsim/shared'
import { mapEngineResult } from './api'
import { MatchPitch } from './MatchPitch'
import { advanceReplayElapsed, matchTimeline, replayFrame } from './replay'
import squads from './landing-squads.json'

const configFor = (seed: number): MatchConfig => ({
  homeTeam: squads.home as MatchConfig['homeTeam'],
  awayTeam: squads.away as MatchConfig['awayTeam'],
  seed: `landing-${seed}`,
  durationMinutes: 90,
})

/**
 * Background demo: the real engine plays a stretch of open play between two squads on the same 2.5D pitch as the
 * match page, with no clock, score or names. It only plays the first half and then starts a fresh match with a new seed.
 */
export function LandingMatch() {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000))
  const result = useMemo(() => mapEngineResult(simulateMatch(configFor(seed)), squads.home.name, squads.away.name), [seed])
  const [elapsed, setElapsed] = useState(0)
  const lastTick = useRef(0)
  const { minute } = matchTimeline(result, elapsed)
  // Stop before half time so the demo never shows a break or a final whistle.
  const lastMinute = (result.halfTimeMinute ?? 45) - 1.5
  const finished = minute >= lastMinute

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setElapsed(24); return }
    let frame = 0
    lastTick.current = performance.now()
    const tick = (now: number) => {
      const seconds = Math.min(0.25, (now - lastTick.current) / 1000)
      lastTick.current = now
      setElapsed(current => advanceReplayElapsed(result, current, seconds, 1))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [result])

  useEffect(() => {
    if (finished) { setSeed(Math.floor(Math.random() * 1_000_000)); setElapsed(0) }
  }, [finished])

  const frame = replayFrame(result.events, result.initialSnapshot, minute)
  const events = result.events.slice(0, frame.visibleCount)
  const latest = events.at(-1)
  const goalEvent = [...events].reverse().find(event => event.type === 'goal' && minute - event.minute < 1.5)
  if (!frame.snapshot) return null

  return <div className="lp-live">
    <MatchPitch snapshot={frame.snapshot} frame={frame} minute={minute} event={latest} celebration={goalEvent} homeName={squads.home.name} awayName={squads.away.name}/>
  </div>
}
