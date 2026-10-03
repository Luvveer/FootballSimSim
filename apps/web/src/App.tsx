import { useEffect, useState } from 'react'
import { ArrowLeft, Check, ChevronDown, CircleDot, Gauge, Play, RotateCcw, Search, Shield, Sparkles, Trophy, X } from 'lucide-react'
import { fetchPlayers, simulateMatch } from './api'
import type { Lineup, MatchEvent, MatchResult, Player, Side, Slot } from './types'

const slots: Slot[] = ['ST', 'LM', 'RM', 'CAM', 'GK']
const emptyLineup = (): Lineup => ({ ST:null, LM:null, RM:null, CAM:null, GK:null })

export function App() {
  const [view, setView] = useState<'builder'|'match'|'result'>('builder')
  const [players, setPlayers] = useState<Player[]>([])
  const [home, setHome] = useState<Lineup>(emptyLineup)
  const [away, setAway] = useState<Lineup>(emptyLineup)
  const [activeSide, setActiveSide] = useState<Side>('home')
  const [activeSlot, setActiveSlot] = useState<Slot>('ST')
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState('ALL')
  const [result, setResult] = useState<MatchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [playersLoading, setPlayersLoading] = useState(true)
  const [playerError, setPlayerError] = useState<string | null>(null)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [reloadPlayers, setReloadPlayers] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setPlayersLoading(true)
      setPlayerError(null)
      try {
        setPlayers(await fetchPlayers(query, position, controller.signal))
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setPlayers([])
        setPlayerError(error instanceof Error ? error.message : 'Could not load players.')
      } finally {
        if (!controller.signal.aborted) setPlayersLoading(false)
      }
    }, query ? 250 : 0)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query, position, reloadPlayers])
  const ready = Object.values(home).every(Boolean) && Object.values(away).every(Boolean)
  const filled = Object.values(home).filter(Boolean).length + Object.values(away).filter(Boolean).length

  const selectPlayer = (player: Player) => {
    const lineup = activeSide === 'home' ? home : away
    const setter = activeSide === 'home' ? setHome : setAway
    if (Object.values(lineup).some(item => item?.id === player.id)) return
    setter({ ...lineup, [activeSlot]: player })
    const next = slots.find(slot => !lineup[slot] && slot !== activeSlot)
    if (next) setActiveSlot(next)
  }

  const start = async () => {
    if (!ready) return
    setLoading(true)
    setMatchError(null)
    try {
      const match = await simulateMatch('Crimson FC', 'Ivory United', home, away)
      setResult(match)
      setView('match')
    } catch (error) {
      setMatchError(error instanceof Error ? error.message : 'The match could not be started.')
    } finally {
      setLoading(false)
    }
  }

  if (view === 'match' && result) return <MatchReplay result={result} onComplete={() => setView('result')} />
  if (view === 'result' && result) return <Results result={result} onReplay={() => setView('match')} onReset={() => { setView('builder'); setResult(null) }} />

  return <div className="app-shell">
    <Header step="build" />
    <main className="builder-main">
      <section className="intro-row">
        <div><p className="eyebrow">Build the impossible match</p><h1>Pick your five.</h1><p className="lede">Choose any era. Any position. Settle the argument on the pitch.</p></div>
        <div className="progress-chip"><span>{filled}</span><div><b>of 10 selected</b><small>Two complete teams</small></div></div>
      </section>

      {playersLoading && <div className="status-banner" role="status">Loading historical players…</div>}
      {playerError && <div className="status-banner error" role="alert"><span>{playerError} Make sure the API is running on port 3001.</span><button onClick={() => setReloadPlayers(value => value + 1)}>Try again</button></div>}
      {matchError && <div className="status-banner error" role="alert"><span>{matchError}</span><button onClick={() => void start()}>Try match again</button></div>}

      <div className="builder-grid">
        <div className="team-column"><TeamHeader side="home" active={activeSide==='home'} onClick={() => setActiveSide('home')} /><Pitch side="home" lineup={home} activeSlot={activeSide==='home' ? activeSlot : null} onSlot={setActiveSlot} onRemove={slot => setHome({...home,[slot]:null})} onActivate={() => setActiveSide('home')} /></div>
        <PlayerBrowser players={players} query={query} setQuery={setQuery} position={position} setPosition={setPosition} activeSide={activeSide} activeSlot={activeSlot} lineup={activeSide==='home'?home:away} onSelect={selectPlayer} />
        <div className="team-column"><TeamHeader side="away" active={activeSide==='away'} onClick={() => setActiveSide('away')} /><Pitch side="away" lineup={away} activeSlot={activeSide==='away' ? activeSlot : null} onSlot={setActiveSlot} onRemove={slot => setAway({...away,[slot]:null})} onActivate={() => setActiveSide('away')} /></div>
      </div>
    </main>
    <footer className="action-bar"><div><b>{ready ? 'Both teams are ready' : `${10-filled} spots left to fill`}</b><span>{ready ? 'Your 60-second match is ready to kick off.' : 'Pick a position on either pitch, then choose a player.'}</span></div><button className="start-button" disabled={!ready || loading} onClick={start}>{loading ? <span className="spinner"/> : <Play size={19} fill="currentColor"/>}{loading ? 'Building match…' : 'Start match'}</button></footer>
  </div>
}

function Header({ step }:{ step:'build'|'match'|'result' }) {
  return <header className="topbar"><a className="brand" href="#" aria-label="FootballSimSim home"><span className="brand-mark"><CircleDot size={22}/></span><span>FOOTBALL<span>SIM</span>SIM</span></a><nav aria-label="Match progress"><span className={step==='build'?'current':''}>01 Build</span><i/><span className={step==='match'?'current':''}>02 Match</span><i/><span className={step==='result'?'current':''}>03 Results</span></nav><div className="format"><Gauge size={16}/><span>5v5 · 60 sec</span></div></header>
}

function TeamHeader({side,active,onClick}:{side:Side;active:boolean;onClick:()=>void}) {
  return <button className={`team-header ${side} ${active?'active':''}`} onClick={onClick}><span className="team-badge"><Shield size={22}/></span><span><small>{side==='home'?'Home team':'Away team'}</small><b>{side==='home'?'Crimson FC':'Ivory United'}</b></span>{active && <span className="editing"><span/> editing</span>}</button>
}

function Pitch({ side,lineup,activeSlot,onSlot,onRemove,onActivate }:{side:Side;lineup:Lineup;activeSlot:Slot|null;onSlot:(s:Slot)=>void;onRemove:(s:Slot)=>void;onActivate:()=>void}) {
  const positions: Record<Slot,string> = { ST:'p-st', LM:'p-lm', RM:'p-rm', CAM:'p-cam', GK:'p-gk' }
  return <div className={`pitch ${side}`} onClick={onActivate}>
    <div className="pitch-lines"><span className="center-line"/><span className="center-circle"/><span className="penalty top"/><span className="penalty bottom"/></div>
    {slots.map(slot => <div className={`pitch-slot ${positions[slot]}`} key={slot}>
      {lineup[slot] ? <div className={`selected-player ${activeSlot===slot?'active':''}`}><button className="player-select" onClick={(e)=>{e.stopPropagation();onSlot(slot);onActivate()}} aria-label={`${lineup[slot]!.name}, ${slot}. Select position`}><span className="mini-rating">{lineup[slot]!.rating}</span><span className="avatar">{initials(lineup[slot]!.name)}</span><span className="player-tag"><b>{lastName(lineup[slot]!.name)}</b><small>{lineup[slot]!.version}</small></span></button><button className="remove" aria-label={`Remove ${lineup[slot]!.name}`} onClick={(e)=>{e.stopPropagation();onRemove(slot)}}><X size={13}/></button></div>
      : <button className={`empty-slot ${activeSlot===slot?'active':''}`} onClick={(e)=>{e.stopPropagation();onSlot(slot);onActivate()}}><span>+</span><b>{slot}</b></button>}
    </div>)}
    <span className="formation-label">1–2–1</span>
  </div>
}

function PlayerBrowser({players,query,setQuery,position,setPosition,activeSide,activeSlot,lineup,onSelect}:{players:Player[];query:string;setQuery:(q:string)=>void;position:string;setPosition:(position:string)=>void;activeSide:Side;activeSlot:Slot;lineup:Lineup;onSelect:(p:Player)=>void}) {
  return <section className="player-browser" aria-label="Player selection">
    <div className="browser-title"><div><p className="eyebrow">Player library</p><h2>Choose for <span>{activeSide==='home'?'Crimson':'Ivory'} · {activeSlot}</span></h2></div><span className="count">{players.length} players</span></div>
    <label className="search-box"><Search size={18}/><span className="sr-only">Search players</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search player, club, or year…"/></label>
    <div className="filter-row" role="group" aria-label="Filter by position">{['ALL','GK','CB','CM','CAM','LW','RW','ST'].map(p=><button className={position===p?'active':''} onClick={()=>setPosition(p)} key={p}>{p}</button>)}</div>
    <div className="player-list">{players.length ? players.map(player => { const used=Object.values(lineup).some(p=>p?.id===player.id); return <button className="player-card" key={player.id} disabled={used} onClick={()=>onSelect(player)}>
      <span className="card-rating"><b>{player.rating}</b><small>{player.position}</small></span><span className="card-avatar">{initials(player.name)}</span><span className="card-identity"><b>{player.name}</b><small>{player.club} · {player.nationality}</small><span>{player.version}</span></span><span className="mini-stats"><small><b>{player.pace}</b>PAC</small><small><b>{player.shooting}</b>SHO</small><small><b>{player.passing}</b>PAS</small></span><span className="add-player">{used?<Check size={16}/>:<span>+</span>}</span>
    </button>}) : <div className="empty-search"><Search size={26}/><b>No players found</b><span>Try a name, club, or a different position.</span></div>}</div>
    <div className="browser-foot"><span><Sparkles size={15}/> Historical versions are rated independently</span><button onClick={()=>{setQuery('');setPosition('ALL')}}>Clear filters</button></div>
  </section>
}

function MatchReplay({result,onComplete}:{result:MatchResult;onComplete:()=>void}) {
  const [second,setSecond]=useState(0)
  const [paused,setPaused]=useState(false)
  useEffect(()=>{ if(paused)return; if(second>=60){const done=setTimeout(onComplete,900);return()=>clearTimeout(done)} const timer=setTimeout(()=>setSecond(s=>s+1),1000);return()=>clearTimeout(timer)},[second,paused,onComplete])
  const minute=Math.min(90,Math.floor(second*1.5))
  const events=result.events.filter(e=>e.minute<=minute)
  const score=events.reduce((value,e)=>e.homeScore!==undefined?[e.homeScore,e.awayScore??value[1]]:value,[0,0] as number[])
  const latest=events.at(-1)
  return <div className="match-page"><Header step="match"/><main className="match-main"><div className="live-pill"><span/> Live simulation</div><div className="scoreboard"><div><Shield/><b>{result.home.name}</b></div><section><span className="clock">{minute.toString().padStart(2,'0')}:00</span><strong>{score[0]} <i>–</i> {score[1]}</strong><small>{minute>=90?'Full time':'Simulated match'}</small></section><div><Shield/><b>{result.away.name}</b></div></div><div className="match-progress"><span style={{width:`${minute/90*100}%`}}/></div>
    <p className="sr-only" aria-live="polite">{latest ? `${latest.minute} minutes. ${latest.detail}` : 'Kick off'}</p><div className="match-layout"><section className="commentary-card"><div className="section-heading"><h2>Match commentary</h2><span>90 minute timeline</span></div><div className="event-list">{[...events].reverse().map((event,i)=><Event event={event} latest={i===0} key={events.length-1-i}/>)}</div></section><aside className="moment-card"><p className="eyebrow">On the pitch</p><div className="ball-visual"><span className={latest?.team==='away'?'away':''}><CircleDot/></span></div><b>{latest?.player||'Kick off'}</b><p>{latest?.detail}</p><button className="pause-button" onClick={()=>setPaused(p=>!p)}>{paused?<Play size={17}/>:<span className="pause-icon"/>}{paused?'Resume':'Pause match'}</button></aside></div></main></div>
}

function Event({event,latest}:{event:MatchEvent;latest:boolean}) { return <article className={`event ${event.type} ${latest?'latest':''}`}><time>{event.minute}'</time><span className="event-icon">{event.type==='goal'?<CircleDot/>:event.type==='save'?<Shield/>:<ChevronDown/>}</span><div><b>{event.type==='goal'?'GOAL':event.type.toUpperCase()} {event.player&&`· ${event.player}`}</b><p>{event.detail}</p></div></article> }

function Results({result,onReplay,onReset}:{result:MatchResult;onReplay:()=>void;onReset:()=>void}) {
  const rows:[string,keyof typeof result.home.stats][]=[['Possession','possession'],['Shots','shots'],['On target','shotsOnTarget'],['Pass accuracy','passAccuracy']]
  return <div className="results-page"><Header step="result"/><main className="results-main"><p className="eyebrow">Full time</p><h1>What a finish.</h1><section className="final-score"><div><Shield/><b>{result.home.name}</b><span>Home</span></div><strong>{result.home.score} <i>–</i> {result.away.score}</strong><div><Shield/><b>{result.away.name}</b><span>Away</span></div></section>
    <div className="result-grid"><section className="stats-panel"><div className="section-heading"><h2>Match stats</h2><span>Final numbers</span></div>{rows.map(([label,key])=>{const h=result.home.stats[key],a=result.away.stats[key];const total=h+a;const homeWidth=total>0?h/total*100:50;const awayWidth=total>0?a/total*100:50;const suffix=key==='possession'||key==='passAccuracy'?'%':'';return <div className="stat-row" key={key}><div><b>{h}{suffix}</b><div className="bar home"><span style={{width:`${homeWidth}%`}}/></div></div><span>{label}</span><div><div className="bar away"><span style={{width:`${awayWidth}%`}}/></div><b>{a}{suffix}</b></div></div>})}</section><aside className="motm"><Trophy/><p className="eyebrow">Player of the match</p><div className="motm-avatar">{initials(result.manOfTheMatch?.player||'Player')}</div><h2>{result.manOfTheMatch?.player}</h2><strong>{result.manOfTheMatch?.rating.toFixed(1)}</strong><span>Match rating</span></aside></div>
    <div className="result-actions"><button className="secondary-button" onClick={onReset}><ArrowLeft/>Edit teams</button><button className="start-button" onClick={onReplay}><RotateCcw/>Watch replay</button></div></main></div>
}

const initials=(name:string)=>name.split(' ').map(n=>n[0]).slice(0,2).join('')
const lastName=(name:string)=>name.split(' ').at(-1) || name
