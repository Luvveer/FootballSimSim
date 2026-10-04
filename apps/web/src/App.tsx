import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, ChevronDown, CircleDot, Gauge, GitCompareArrows, Play, RotateCcw, Search, Shield, Sparkles, Trophy, X } from 'lucide-react'
import { fetchPlayers, fetchPlayerVersions, simulateMatch } from './api'
import type { Lineup, MatchEvent, MatchResult, Player, Side, Slot } from './types'

const slots: Slot[] = ['ST', 'LM', 'RM', 'CAM', 'GK']
const emptyLineup = (): Lineup => ({ ST:null, LM:null, RM:null, CAM:null, GK:null })

export function App() {
  const [view, setView] = useState<'builder'|'match'|'result'>('builder')
  const [players, setPlayers] = useState<Player[]>([])
  const [playerTotal, setPlayerTotal] = useState(0)
  const [home, setHome] = useState<Lineup>(emptyLineup)
  const [away, setAway] = useState<Lineup>(emptyLineup)
  const [activeSide, setActiveSide] = useState<Side>('home')
  const [activeSlot, setActiveSlot] = useState<Slot>('ST')
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState('ALL')
  const [result, setResult] = useState<MatchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [playersLoading, setPlayersLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [playerError, setPlayerError] = useState<string | null>(null)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [reloadPlayers, setReloadPlayers] = useState(0)
  const [comparisonPlayer, setComparisonPlayer] = useState<Player | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setPlayersLoading(true)
      setPlayerError(null)
      try {
        const page = await fetchPlayers(query, position, 0, controller.signal)
        setPlayers(page.players)
        setPlayerTotal(page.total)
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

  const loadMorePlayers = async () => {
    if (loadingMore || players.length >= playerTotal) return
    setLoadingMore(true)
    setPlayerError(null)
    try {
      const page = await fetchPlayers(query, position, players.length)
      setPlayers(current => [...current, ...page.players])
      setPlayerTotal(page.total)
    } catch (error) {
      setPlayerError(error instanceof Error ? error.message : 'Could not load more players.')
    } finally {
      setLoadingMore(false)
    }
  }
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
        <PlayerBrowser players={players} total={playerTotal} loadingMore={loadingMore} onLoadMore={loadMorePlayers} query={query} setQuery={setQuery} position={position} setPosition={setPosition} activeSide={activeSide} activeSlot={activeSlot} lineup={activeSide==='home'?home:away} onSelect={selectPlayer} onCompare={setComparisonPlayer} />
        <div className="team-column"><TeamHeader side="away" active={activeSide==='away'} onClick={() => setActiveSide('away')} /><Pitch side="away" lineup={away} activeSlot={activeSide==='away' ? activeSlot : null} onSlot={setActiveSlot} onRemove={slot => setAway({...away,[slot]:null})} onActivate={() => setActiveSide('away')} /></div>
      </div>
    </main>
    {comparisonPlayer && <PlayerComparison player={comparisonPlayer} onClose={() => setComparisonPlayer(null)} />}
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
      {lineup[slot] ? <div className={`selected-player ${activeSlot===slot?'active':''}`}><button className="player-select" onClick={(e)=>{e.stopPropagation();onSlot(slot);onActivate()}} aria-label={`${lineup[slot]!.name}, ${slot}. Select position`}><span className="mini-rating">{lineup[slot]!.rating}</span><span className="avatar">{initials(lineup[slot]!.name)}</span><span className="player-tag"><b>{lastName(lineup[slot]!.name)}</b><small>{formatVersion(lineup[slot]!.version)}</small></span></button><button className="remove" aria-label={`Remove ${lineup[slot]!.name}`} onClick={(e)=>{e.stopPropagation();onRemove(slot)}}><X size={13}/></button></div>
      : <button className={`empty-slot ${activeSlot===slot?'active':''}`} onClick={(e)=>{e.stopPropagation();onSlot(slot);onActivate()}}><span>+</span><b>{slot}</b></button>}
    </div>)}
    <span className="formation-label">1–2–1</span>
  </div>
}

function PlayerBrowser({players,total,loadingMore,onLoadMore,query,setQuery,position,setPosition,activeSide,activeSlot,lineup,onSelect,onCompare}:{players:Player[];total:number;loadingMore:boolean;onLoadMore:()=>void;query:string;setQuery:(q:string)=>void;position:string;setPosition:(position:string)=>void;activeSide:Side;activeSlot:Slot;lineup:Lineup;onSelect:(p:Player)=>void;onCompare:(p:Player)=>void}) {
  return <section className="player-browser" aria-label="Player selection">
    <div className="browser-title"><div><p className="eyebrow">Player library</p><h2>Choose for <span>{activeSide==='home'?'Crimson':'Ivory'} · {activeSlot}</span></h2></div><span className="count">{players.length} of {total}</span></div>
    <label className="search-box"><Search size={18}/><span className="sr-only">Search players</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search player, club, or year…"/></label>
    <div className="filter-row" role="group" aria-label="Filter by position">{['ALL','GK','CB','CM','CAM','LW','RW','ST'].map(p=><button className={position===p?'active':''} onClick={()=>setPosition(p)} key={p}>{p}</button>)}</div>
    <div className="player-list">{players.length ? players.map(player => { const used=Object.values(lineup).some(p=>p?.id===player.id); return <article className={`player-card ${used?'used':''}`} key={`${player.id}-${player.version}`}>
      <button className="player-card-main" disabled={used} onClick={()=>onSelect(player)} aria-label={`${used?'Already selected':'Add'} ${player.name}, ${formatVersion(player.version)}`}><span className="card-rating"><b>{player.rating}</b><small>{player.position}</small></span><span className="card-avatar">{initials(player.name)}</span><span className="card-identity"><b>{player.name}</b><small>{player.club} · {player.nationality}</small><span>{formatVersion(player.version)}</span></span><span className="mini-stats"><small><b>{player.pace}</b>PAC</small><small><b>{player.shooting}</b>SHO</small><small><b>{player.passing}</b>PAS</small></span><span className="add-player">{used?<Check size={16}/>:<span>+</span>}</span></button>
      <button className="compare-player" onClick={()=>onCompare(player)} aria-label={`Compare FIFA versions of ${player.name}`} title="Compare FIFA versions"><GitCompareArrows size={16}/></button>
    </article>}) : <div className="empty-search"><Search size={26}/><b>No players found</b><span>Try a name, club, or a different position.</span></div>}{players.length < total && <button className="load-more" disabled={loadingMore} onClick={onLoadMore}>{loadingMore ? 'Loading…' : `Load more (${total-players.length} remaining)`}</button>}</div>
    <div className="browser-foot"><span><Sparkles size={15}/> Historical versions are rated independently</span><button onClick={()=>{setQuery('');setPosition('ALL')}}>Clear filters</button></div>
  </section>
}

const comparisonStats = [
  ['Pace', 'pace'], ['Shooting', 'shooting'], ['Passing', 'passing'],
  ['Dribbling', 'dribbling'], ['Defending', 'defending'], ['Physical', 'physical'],
] as const

function PlayerComparison({player,onClose}:{player:Player;onClose:()=>void}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [versions,setVersions] = useState<Player[]>([])
  const [firstIndex,setFirstIndex] = useState(0)
  const [secondIndex,setSecondIndex] = useState(0)
  const [error,setError] = useState<string|null>(null)
  const [loading,setLoading] = useState(true)

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetchPlayerVersions(player.id, controller.signal).then(items => {
      setVersions(items)
      setFirstIndex(0)
      setSecondIndex(Math.max(0, items.length - 1))
    }).catch(value => {
      if (!(value instanceof DOMException && value.name === 'AbortError')) setError(value instanceof Error ? value.message : 'Could not load player history.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [player.id])

  const first = versions[firstIndex]
  const second = versions[secondIndex]
  return <dialog className="comparison-dialog" ref={dialogRef} onCancel={onClose} onClose={onClose} aria-labelledby="comparison-title">
    <div className="comparison-head"><div><p className="eyebrow">Player evolution</p><h2 id="comparison-title">{player.name} through the years</h2><p>Pick two FIFA editions and see how the ratings changed.</p></div><button className="dialog-close" onClick={onClose} aria-label="Close player comparison"><X/></button></div>
    {loading && <div className="comparison-status" role="status">Loading FIFA history…</div>}
    {error && <div className="comparison-status error" role="alert">{error}</div>}
    {!loading && !error && versions.length < 2 && <div className="comparison-status">Only one FIFA edition is available for this player.</div>}
    {first && second && <>
      <div className="version-pickers"><label><span>Earlier edition</span><select value={firstIndex} onChange={event=>setFirstIndex(Number(event.target.value))}>{versions.map((item,index)=><option value={index} key={item.version}>{formatVersion(item.version)} · {item.club}</option>)}</select></label><GitCompareArrows aria-hidden="true"/><label><span>Later edition</span><select value={secondIndex} onChange={event=>setSecondIndex(Number(event.target.value))}>{versions.map((item,index)=><option value={index} key={item.version}>{formatVersion(item.version)} · {item.club}</option>)}</select></label></div>
      <div className="comparison-body"><RadarChart first={first} second={second}/><div className="comparison-table" role="table" aria-label={`${player.name} attribute comparison`}><div className="comparison-row header" role="row"><span role="columnheader">Attribute</span><b role="columnheader">{formatVersion(first.version)}</b><b role="columnheader">{formatVersion(second.version)}</b><span role="columnheader">Change</span></div>{comparisonStats.map(([label,key])=>{const change=second[key]-first[key];return <div className="comparison-row" role="row" key={key}><span role="cell">{label}</span><b role="cell">{first[key]}</b><b role="cell">{second[key]}</b><span role="cell" className={change>0?'up':change<0?'down':''}>{change>0?`+${change}`:change}</span></div>})}</div></div>
      <div className="comparison-summary"><span><b>{first.rating}</b> overall in {formatVersion(first.version)}</span><span aria-hidden="true">→</span><span><b>{second.rating}</b> overall in {formatVersion(second.version)}</span></div>
    </>}
  </dialog>
}

function RadarChart({first,second}:{first:Player;second:Player}) {
  const center=150, radius=102
  const point=(index:number,value:number) => { const angle=-Math.PI/2+index*Math.PI*2/comparisonStats.length; const distance=radius*value/100; return `${center+Math.cos(angle)*distance},${center+Math.sin(angle)*distance}` }
  const ring=(value:number) => comparisonStats.map((_,index)=>point(index,value)).join(' ')
  return <figure className="radar"><svg viewBox="0 0 300 300" role="img" aria-labelledby="radar-title radar-desc"><title id="radar-title">Radar chart comparing {first.name} in {formatVersion(first.version)} and {formatVersion(second.version)}</title><desc id="radar-desc">Exact values are listed beside the chart.</desc>{[25,50,75,100].map(value=><polygon className="radar-grid" points={ring(value)} key={value}/>)}{comparisonStats.map((_,index)=><line className="radar-axis" x1={center} y1={center} x2={point(index,100).split(',')[0]} y2={point(index,100).split(',')[1]} key={index}/>)}<polygon className="radar-shape first" points={comparisonStats.map(([,key],index)=>point(index,first[key])).join(' ')}/><polygon className="radar-shape second" points={comparisonStats.map(([,key],index)=>point(index,second[key])).join(' ')}/>{comparisonStats.map(([label],index)=>{const [x,y]=point(index,118).split(',');return <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" key={label}>{label.slice(0,3).toUpperCase()}</text>})}</svg><figcaption><span className="legend-first">{formatVersion(first.version)}</span><span className="legend-second">{formatVersion(second.version)}</span></figcaption></figure>
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
const formatVersion=(version:string)=>version.toUpperCase().startsWith('FIFA') ? version : `FIFA ${version}`
