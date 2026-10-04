import { useEffect, useState } from 'react'
import { Activity, ArrowRight, CircleDot, Play, Shield, Target, Trophy } from 'lucide-react'
import type { ReplaySnapshot, TeamMatchStats } from '@footballsimsim/shared'
import type { MatchEvent, MatchResult } from './types'
import { Header } from './App'
import { MatchPitch } from './MatchPitch'
import './MatchReplay.css'
import { advanceReplayElapsed, matchClock, matchTimeline, playbackRemaining, replayFrame } from './replay'

const phases = { BUILDUP: 'Building from the back', PROGRESSION: 'Moving through midfield', ATTACK: 'Pressure in the final third', SHOT: 'Chance at goal', GOAL: 'Goal!', RESTART: 'Set piece', HALF_TIME: 'Half time', FULL_TIME: 'Full time' }

export function MatchReplay({ result, onComplete, onHome }: { result: MatchResult; onComplete: () => void; onHome: () => void }) {
  const [elapsed, setElapsed] = useState(0)
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(1)
  const { minute, progress, half, inHalfTime, breakRemaining, complete, period } = matchTimeline(result, elapsed)
  useEffect(() => {
    if (paused || complete) return
    const startedAt = Date.now()
    const startedElapsed = elapsed
    let animation = 0
    const advance = () => {
      setElapsed(advanceReplayElapsed(result,startedElapsed,(Date.now()-startedAt)/1000,speed))
    }
    const tick = () => {
      advance()
      animation = window.requestAnimationFrame(tick)
    }
    // Browsers suspend animation frames in occluded/background windows. Keep
    // the match clock progressing there, while visible playback stays smooth.
    const fallback = window.setInterval(advance, 100)
    window.addEventListener('focus', advance)
    document.addEventListener('visibilitychange', advance)
    animation = window.requestAnimationFrame(tick)
    return () => { window.cancelAnimationFrame(animation); window.clearInterval(fallback); window.removeEventListener('focus', advance); document.removeEventListener('visibilitychange', advance) }
  }, [paused, speed, complete, result])
  useEffect(() => {
    if (!complete || paused) return
    const timer = window.setTimeout(onComplete, 1800)
    return () => window.clearTimeout(timer)
  }, [complete, paused, onComplete])

  const frame = replayFrame(result.events, result.initialSnapshot, minute, inHalfTime)
  const events = result.events.slice(0, frame.visibleCount)
  const latest = events.at(-1)
  const snapshot = frame.snapshot
  const decisionEvent = [...events].reverse().find(event=>event.offside && minute-event.minute<2.5 && event.snapshot?.period===snapshot?.period)
  const score = [latest?.homeScore ?? 0, latest?.awayScore ?? 0]
  const possession = snapshot?.possession === 'AWAY' ? result.away.name : result.home.name
  const goalEvent = [...events].reverse().find(event=>event.type==='goal' && minute-event.minute<1.5)
  const goal = !!goalEvent && !inHalfTime && !complete
  const phase = inHalfTime ? 'Half-time break' : complete ? result.status==='ABANDONED'?'Match abandoned':'Full time' : goal ? 'Goal!' : snapshot?.phase==='HALF_TIME'?'Ready for the second half':snapshot ? phases[snapshot.phase] : 'Kick off'
  const recent = [...events].reverse().slice(0, 20)
  const displayName = (event: MatchEvent) => result.initialSnapshot?.players.find(player => player.playerId===event.playerId && player.team===(event.team==='home'?'HOME':'AWAY'))?.name ?? event.player
  const scorers = events.filter(event => event.type === 'goal')
  const periodLabel = inHalfTime ? 'HALF TIME' : complete ? result.status === 'ABANDONED' ? 'ABANDONED' : 'FULL TIME' : period === 2 ? 'SECOND HALF' : 'FIRST HALF'
  const homeDirection = snapshot?.direction?.HOME ?? 1
  const finishedLabel = result.status === 'ABANDONED' ? 'Match abandoned' : 'Full time'

  return <div className="match-page arena-page"><Header step="match" onHome={onHome}/><main className="arena-main">
    <div className="arena-topline"><span className="live-pill"><span/>{paused ? 'Replay paused' : inHalfTime ? 'Half-time break' : complete ? finishedLabel : 'Match in progress'}</span><span>5-a-side · Football rules</span></div>
    <section className={`arena-scoreboard ${goal ? 'celebrating' : ''}`} aria-label="Scoreboard">
      <div className="arena-team home"><span className="arena-crest"><Shield/></span><div><small>Home · attacking {homeDirection === 1 ? '→' : '←'}</small><b>{result.home.name}</b></div></div>
      <div className="arena-score"><time>{matchClock(result, minute, period)}</time><strong>{score[0]} <i>:</i> {score[1]}</strong><span>{periodLabel}</span></div>
      <div className="arena-team away"><div><small>{homeDirection === 1 ? '←' : '→'} attacking · Away</small><b>{result.away.name}</b></div><span className="arena-crest"><Shield/></span></div>
    </section>
    <div className="arena-timeline">
      <div className="arena-progress" role="progressbar" aria-label="Match progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress*100)} aria-valuetext={`${matchClock(result,minute,period)}, ${periodLabel.toLowerCase()}`}><span style={{transform:`scaleX(${progress})`}}/><i style={{left:`${Math.min(1,half)*100}%`}}/></div>
      <div className="arena-timeline-labels"><span>Kickoff</span><span style={{left:`${Math.min(1,half)*100}%`}}>Half time</span><span>{result.status==='ABANDONED'?'End':'Full time'} · {result.regulationMinutes ?? 90} min + added time</span></div>
    </div>
    <div className={`arena-layout ${inHalfTime?'half-time-break':''}`}>
      <section className="arena-field-card">
        <div className="arena-field-heading"><span><Activity size={16}/>{phase}</span><small>{inHalfTime ? 'Clock stopped · five-second interval' : complete ? 'Match complete' : `${possession} in possession`}</small></div>
        <div className="pitch-stage">{snapshot && <MatchPitch snapshot={snapshot} frame={frame} minute={minute} event={latest} celebration={goal?goalEvent:undefined} decision={inHalfTime?undefined:decisionEvent?.offside} homeName={result.home.name} awayName={result.away.name}/>}
          {inHalfTime && <div className="half-time-overlay" role="status"><div><p>Half time</p><strong>{result.home.name} <span>{score[0]} : {score[1]}</span> {result.away.name}</strong><b>{Math.ceil(breakRemaining)}</b><small>{paused?'Break paused':`Second half in ${Math.ceil(breakRemaining)} seconds`}</small><span>Teams change ends. Time to regroup.</span></div></div>}
        </div>
        <div className={`play-insight ${goal ? 'goal-insight' : ''}`}>
          <span className="insight-icon">{goal ? <Trophy/> : latest?.type === 'shot' || latest?.type === 'save' ? <Target/> : <Activity/>}</span>
          <div><b>{inHalfTime?'The teams regroup for the second half.':goalEvent?.detail ?? latest?.detail ?? 'The teams are ready. The opening possession begins.'}</b><p>{inHalfTime?'The match clock is paused during this five-second interval.':goalEvent?.explanation ?? latest?.explanation ?? 'Passing, movement, defensive pressure and finishing shape every attack.'}</p></div>
        </div>
        <div className="arena-controls">
          <button className="replay-toggle" onClick={()=>setPaused(value=>!value)} aria-label={paused?'Resume match':'Pause match'}>{paused?<Play size={16}/>:<span className="pause-icon"/>}{paused?'Resume':'Pause'}</button>
          <div className="replay-speed" role="group" aria-label="Replay speed">{[0.5,1,2].map(value=><button key={value} aria-pressed={speed===value} className={speed===value?'active':''} onClick={()=>setSpeed(value)}>{value}×</button>)}</div>
          <span className="replay-time">{Math.ceil(playbackRemaining(result,elapsed,speed))}s remaining</span>
        </div>
        <div className="arena-scorers">{scorers.length ? scorers.map((event,index)=><span key={index} className={event.team}><CircleDot size={12}/>{displayName(event)} {matchClock(result,event.minute,event.snapshot?.period)}</span>) : <span>The opening goal is still to come</span>}</div>
      </section>
      <aside className="arena-sidebar">
        {snapshot && <LiveStats snapshot={snapshot}/>}
        {result.teamProfiles && <section className="team-strength"><div className="section-heading"><h2>Team attributes</h2><span>Starting lineup</span></div>{(['attack','control','defence','goalkeeping'] as const).map(key=><div className="strength-row" key={key}><b>{result.teamProfiles!.HOME[key]}</b><span>{key}</span><b>{result.teamProfiles!.AWAY[key]}</b></div>)}<p>Role fit and stamina affect these abilities during play.</p></section>}
      </aside>
    </div>
    <section className="arena-commentary"><div className="section-heading"><h2>Match feed</h2><span>{events.length} actions played</span></div><p className="sr-only" aria-live="polite">{latest?.detail ?? 'Kick off'}</p><div className="arena-feed">{recent.length ? recent.map((event,index)=><article className={`feed-event ${event.team} ${event.type} ${index===0?'current':''}`} key={`${event.minute}-${events.length-index}`}><time>{matchClock(result,event.minute,event.snapshot?.period)}</time><span className="feed-symbol">{event.type==='goal'?<CircleDot/>:event.type==='shot'?<Target/>:event.type==='save'?<Shield/>:event.type==='yellow_card'||event.type==='red_card'?<i className={`discipline-card ${event.type}`}/>:<ArrowRight/>}</span><div><small>{event.team==='home'?result.home.name:result.away.name} · {event.type.replaceAll('_',' ')}</small><b>{event.detail}</b></div>{event.expectedGoals!==undefined && event.type==='shot' && <span className="xg-tag">{event.expectedGoals.toFixed(2)} xG</span>}</article>):<p className="feed-waiting">Waiting for the first play…</p>}</div></section>
  </main></div>
}

function LiveStats({snapshot}:{snapshot:ReplaySnapshot}) {
  const home = snapshot.teamStats.HOME
  const away = snapshot.teamStats.AWAY
  const accuracy = (stats:TeamMatchStats)=>stats.passesAttempted?Math.round(stats.passesCompleted/stats.passesAttempted*100):0
  const rows: [string,number,number,string][] = [['Possession',home.possession,away.possession,'%'],['Shots',home.shots,away.shots,''],['On target',home.shotsOnTarget,away.shotsOnTarget,''],['Expected goals',home.expectedGoals,away.expectedGoals,'xg'],['Pass accuracy',accuracy(home),accuracy(away),'%'],['Fouls',home.fouls,away.fouls,''],['Offsides',home.offsides,away.offsides,''],['Corners',home.corners,away.corners,''],['Yellow cards',home.yellowCards,away.yellowCards,''],['Red cards',home.redCards,away.redCards,'']]
  return <section className="arena-live-stats"><div className="section-heading"><h2>Live match stats</h2><span>Crimson / Ivory</span></div>{rows.map(([label,h,a,suffix])=><div className="live-stat" key={label}><div><b>{suffix==='xg'?h.toFixed(2):`${h}${suffix}`}</b><span>{label}</span><b>{suffix==='xg'?a.toFixed(2):`${a}${suffix}`}</b></div><div className="live-stat-bar"><span style={{width:`${h+a ? h/(h+a)*100:50}%`}}/></div></div>)}</section>
}
