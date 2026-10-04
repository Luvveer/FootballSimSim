import { useEffect, useState } from 'react'
import { Activity, ArrowRight, CircleDot, FastForward, Play, Shield, Target, Trophy } from 'lucide-react'
import type { ReplaySnapshot, TeamMatchStats } from '@footballsimsim/shared'
import type { MatchEvent, MatchResult } from './types'
import { Header } from './App'
import { MatchPitch } from './MatchPitch'
import { versionLabel } from './version-label'
import './MatchReplay.css'
import { advanceReplayElapsed, matchClock, matchTimeline, playbackRemaining, replayFrame } from './replay'

const phases = { BUILDUP: 'Building from the back', PROGRESSION: 'Moving through midfield', ATTACK: 'Pressure in the final third', SHOT: 'Chance at goal', GOAL: 'Goal!', RESTART: 'Set piece', HALF_TIME: 'Half time', FULL_TIME: 'Full time' }

// "45:00 +06:33" -> "45+7'", "38:36" -> "38'"
const shortMinute = (clock: string) => {
  const [base, extra] = clock.split(' +')
  const minute = parseInt(base ?? '0', 10)
  if (!extra) return `${minute}'`
  const [added = 0, seconds = 0] = extra.split(':').map(Number)
  return `${minute}+${added + (seconds > 0 ? 1 : 0)}'`
}

type Roster = NonNullable<MatchResult['initialSnapshot']>['players']

// A live version of the engine's end-of-match rating, built only from the events played so far.
function liveTopPlayer(events: MatchEvent[], roster: Roster) {
  const blank = () => ({ goals: 0, assists: 0, saves: 0, interceptions: 0, passes: 0, dribbles: 0, missed: 0, yellow: 0, red: 0 })
  const stats = new Map<string, ReturnType<typeof blank>>()
  const of = (team: string, playerId?: string) => {
    const key = `${team}:${playerId}`
    if (!stats.has(key)) stats.set(key, blank())
    return stats.get(key)!
  }
  for (const event of events) {
    if (!event.playerId) continue
    const actor = of(event.team, event.playerId)
    if (event.type === 'goal') { actor.goals++; if (event.assistId) of(event.team, event.assistId).assists++ }
    else if (event.type === 'save') actor.saves++
    else if (event.type === 'interception') actor.interceptions++
    else if (event.type === 'pass' && event.successful !== false) actor.passes++
    else if (event.type === 'dribble' && event.successful) actor.dribbles++
    else if (event.type === 'shot' && !event.successful) actor.missed++
    else if (event.type === 'yellow_card') actor.yellow++
    else if (event.type === 'red_card') actor.red++
  }
  let best: { player: Roster[number]; rating: number; stat: ReturnType<typeof blank> } | undefined
  for (const player of roster) {
    const stat = stats.get(`${player.team === 'AWAY' ? 'away' : 'home'}:${player.playerId}`) ?? blank()
    const rating = Math.min(10, Math.max(5, Math.round((6 + stat.goals * 1.2 + stat.assists * 0.6 + stat.saves * 0.1 + stat.interceptions * 0.08 + stat.passes * 0.01 + stat.dribbles * 0.04 - stat.missed * 0.06 - stat.yellow * 0.2 - stat.red * 0.8) * 10) / 10))
    if (!best || rating > best.rating || (rating === best.rating && stat.goals > best.stat.goals)) best = { player, rating, stat }
  }
  return best && best.rating > 6 ? best : undefined
}

function PlayerToWatch({ events, roster, result }: { events: MatchEvent[]; roster: Roster; result: MatchResult }) {
  const top = liveTopPlayer(events, roster)
  return <section className="player-watch">
    <div className="watch-label"><span>Player to watch</span><small>Live Top Rating</small></div>
    {top ? <div className={`watch-body ${top.player.team === 'AWAY' ? 'away' : 'home'}`}>
      <span className="watch-avatar">{top.player.name.split(' ').slice(0, 2).map(word => word[0]).join('')}</span>
      <div><b>{top.player.name}</b><small>{top.player.team === 'AWAY' ? result.away.name : result.home.name}</small></div>
      <strong>{top.rating.toFixed(1)}</strong>
    </div> : <p className="watch-wait">Ratings appear once the match gets going.</p>}
  </section>
}

export function MatchReplay({ result, onComplete, onHome, onBuild }: { result: MatchResult; onComplete: () => void; onHome: () => void; onBuild: () => void }) {
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
  // Goal scorers (names only) listed under each team's name in the scoreboard.
  const Scorers = ({ side }: { side: 'home' | 'away' }) => {
    // One line per player: "K. Mbappé 29', 61'". Different editions of the same footballer are different players in this game,
    // so they stay on separate lines, with the edition added whenever the squad has two players with the same name.
    const groups = new Map<string, { name: string; minutes: string[]; edition: string }>()
    for (const event of scorers.filter(goal => goal.team === side)) {
      const key = event.playerId ?? displayName(event)
      const group = groups.get(key) ?? { name: displayName(event), minutes: [], edition: versionLabel((event.playerId ?? '').split(':')[1] ?? '') }
      group.minutes.push(shortMinute(matchClock(result, event.minute, event.snapshot?.period)))
      groups.set(key, group)
    }
    const lines = [...groups.values()]
    if (!lines.length) return null
    // The edition is added whenever two players with the same name are in this team's squad, even if only one of them scored.
    const squadNames = (result.initialSnapshot?.players ?? []).filter(player => player.team === (side === 'home' ? 'HOME' : 'AWAY')).map(player => player.name)
    return <span className="team-scorers">{lines.map((line, index) => <span key={index}><CircleDot size={11}/>{line.name}{squadNames.filter(name => name === line.name).length > 1 && line.edition ? ` (${line.edition})` : ''} {line.minutes.join(', ')}</span>)}</span>
  }
  const periodLabel = inHalfTime ? 'HALF TIME' : complete ? result.status === 'ABANDONED' ? 'ABANDONED' : 'FULL TIME' : period === 2 ? 'SECOND HALF' : 'FIRST HALF'
  const homeDirection = snapshot?.direction?.HOME ?? 1
  const finishedLabel = result.status === 'ABANDONED' ? 'Match abandoned' : 'Full time'

  return <div className="match-page arena-page"><Header step="match" onHome={onHome} onBuild={onBuild}/><main className="arena-main">
    <div className="arena-topline"><span className="live-pill"><span/>{paused ? 'Replay paused' : inHalfTime ? 'Half-time break' : complete ? finishedLabel : 'Match in progress'}</span><button type="button" className="sim-end" onClick={onComplete}><FastForward size={14}/>Sim to End</button></div>
    <section className={`arena-scoreboard ${goal ? 'celebrating' : ''}`} aria-label="Scoreboard">
      <div className="arena-team home"><span className="arena-crest"><Shield/></span><div><small>Home · attacking {homeDirection === 1 ? '→' : '←'}</small><b>{result.home.name}</b><Scorers side="home"/></div></div>
      <div className="arena-score"><time>{matchClock(result, minute, period)}</time><strong>{score[0]} <i>:</i> {score[1]}</strong><span>{periodLabel}</span></div>
      <div className="arena-team away"><div><small>{homeDirection === 1 ? '←' : '→'} attacking · Away</small><b>{result.away.name}</b><Scorers side="away"/></div><span className="arena-crest"><Shield/></span></div>
    </section>
    <div className="arena-timeline">
      <div className="arena-progress" role="progressbar" aria-label="Match progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress*100)} aria-valuetext={`${matchClock(result,minute,period)}, ${periodLabel.toLowerCase()}`}><span style={{transform:`scaleX(${progress})`}}/><i style={{left:`${Math.min(1,half)*100}%`}}/></div>
      <div className="arena-timeline-labels"><span>Kickoff</span><span style={{left:`${Math.min(1,half)*100}%`}}>Half Time</span><span>{result.status==='ABANDONED'?'End':'Full Time'}</span></div>
    </div>
    <div className={`arena-layout ${inHalfTime?'half-time-break':''}`}>
      <section className="arena-field-card">
        <div className="arena-field-heading"><span><Activity size={16}/>{phase}</span><small>{inHalfTime ? 'Clock stopped · five-second interval' : complete ? 'Match complete' : `${possession} in possession`}</small></div>
        <div className="pitch-stage">{snapshot && <MatchPitch snapshot={snapshot} frame={frame} minute={minute} event={latest} celebration={goal?goalEvent:undefined} decision={inHalfTime?undefined:decisionEvent?.offside} homeName={result.home.name} awayName={result.away.name}/>}
          {inHalfTime && <div className="half-time-overlay" role="status"><div><p>Half time</p><strong>{result.home.name} <span>{score[0]} : {score[1]}</span> {result.away.name}</strong><b>{Math.ceil(breakRemaining)}</b><small>{paused?'Break paused':`Second half soon...`}</small><span>Teams change ends. Time to regroup.</span></div></div>}
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
      </section>
      <aside className="arena-sidebar">
        {snapshot && <LiveStats snapshot={snapshot}/>}
        {result.initialSnapshot && <PlayerToWatch events={events} roster={result.initialSnapshot.players} result={result}/>}
        {result.teamProfiles && <section className="team-strength"><div className="section-heading"><h2>Team attributes</h2></div>{(['attack','control','defence','goalkeeping'] as const).map(key=><div className="strength-row" key={key}><b>{result.teamProfiles!.HOME[key]}</b><span>{key}</span><b>{result.teamProfiles!.AWAY[key]}</b></div>)}</section>}
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
