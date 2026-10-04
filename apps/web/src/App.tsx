import { useEffect, useRef, useState } from 'react'
import { Check, CircleDot, Gauge, GitCompareArrows, Pencil, Play, Search, Shield, Sparkles, X } from 'lucide-react'
import { fetchPlayers, simulateMatch } from './api'
import { MatchReplay } from './MatchReplay'
import { PlayerComparison } from './PlayerComparison'
import { Results } from './Results'
import type { Lineup, MatchResult, Player, Side, Slot } from './types'

const slots: Slot[] = ['ST', 'LM', 'RM', 'CAM', 'GK']
const emptyLineup = (): Lineup => ({ ST:null, LM:null, RM:null, CAM:null, GK:null })

export function App() {
  const [view, setView] = useState<'builder'|'match'|'result'>('builder')
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }) }, [view])
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
  const [homeName, setHomeName] = useState('Home Team')
  const [awayName, setAwayName] = useState('Away Team')

  const playerRequest = useRef<AbortController | null>(null)
  const [loadedFilters, setLoadedFilters] = useState('')
  const filterKey = JSON.stringify([query, position, reloadPlayers])
  const searchPending = playersLoading || loadedFilters !== filterKey

  useEffect(() => {
    const controller = new AbortController()
    playerRequest.current = controller
    setPlayersLoading(true)
    setLoadingMore(false)
    setPlayerError(null)
    const timer = window.setTimeout(async () => {
      setPlayersLoading(true)
      setPlayerError(null)
      try {
        const page = await fetchPlayers(query, position, 0, controller.signal)
        if (controller.signal.aborted) return
        setLoadedFilters(JSON.stringify([query, position, reloadPlayers]))
        setPlayers(page.players)
        setPlayerTotal(page.total)
      } catch (error) {
        if (controller.signal.aborted) return
        setLoadedFilters(JSON.stringify([query, position, reloadPlayers]))
        setPlayerTotal(0)
        setPlayers([])
        setPlayerError(error instanceof Error ? error.message : 'Could not load players.')
      } finally {
        if (!controller.signal.aborted) setPlayersLoading(false)
      }
    }, query ? 250 : 0)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query, position, reloadPlayers])

  const loadMorePlayers = async () => {
    const controller = playerRequest.current
    if (searchPending || loadingMore || !controller || controller.signal.aborted || players.length >= playerTotal) return
    setLoadingMore(true)
    setPlayerError(null)
    try {
      const page = await fetchPlayers(query, position, players.length, controller.signal)
      if (controller.signal.aborted) return
      setPlayers(current => [...current, ...page.players])
      setPlayerTotal(page.total)
    } catch (error) {
      if (controller.signal.aborted) return
      setPlayerError(error instanceof Error ? error.message : 'Could not load more players.')
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false)
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
      const match = await simulateMatch(homeName.trim() || 'Home', awayName.trim() || 'Away', home, away)
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
        <div className="team-column"><TeamHeader side="home" name={homeName} setName={setHomeName} active={activeSide==='home'} onClick={() => setActiveSide('home')} /><Pitch side="home" lineup={home} activeSlot={activeSide==='home' ? activeSlot : null} onSlot={setActiveSlot} onRemove={slot => setHome({...home,[slot]:null})} onActivate={() => setActiveSide('home')} /></div>
        <PlayerBrowser activeName={activeSide==='home'?homeName:awayName} searching={searchPending} players={players} total={playerTotal} loadingMore={loadingMore} onLoadMore={loadMorePlayers} query={query} setQuery={setQuery} position={position} setPosition={setPosition} activeSlot={activeSlot} lineup={activeSide==='home'?home:away} onSelect={selectPlayer} onCompare={setComparisonPlayer} />
        <div className="team-column"><TeamHeader side="away" name={awayName} setName={setAwayName} active={activeSide==='away'} onClick={() => setActiveSide('away')} /><Pitch side="away" lineup={away} activeSlot={activeSide==='away' ? activeSlot : null} onSlot={setActiveSlot} onRemove={slot => setAway({...away,[slot]:null})} onActivate={() => setActiveSide('away')} /></div>
      </div>
    </main>
    {comparisonPlayer && <PlayerComparison player={comparisonPlayer} onClose={() => setComparisonPlayer(null)} />}
    <footer className="action-bar"><div><b>{ready ? 'Both teams are ready' : `${10-filled} spots left to fill`}</b><span>{ready ? '45 seconds per half, a 5-second break, plus added time.' : 'Pick a position on either pitch, then choose a player.'}</span></div><button className="start-button" disabled={!ready || loading} onClick={start}>{loading ? <span className="spinner"/> : <Play size={19} fill="currentColor"/>}{loading ? 'Building match…' : 'Start match'}</button></footer>
  </div>
}

export function Header({ step }:{ step:'build'|'match'|'result' }) {
  return <header className="topbar"><a className="brand" href="#" aria-label="FootballSimSim home"><span className="brand-mark"><CircleDot size={22}/></span><span>FOOTBALL<span>SIM</span>SIM</span></a><nav aria-label="Match progress"><span className={step==='build'?'current':''}>01 Build</span><i/><span className={step==='match'?'current':''}>02 Match</span><i/><span className={step==='result'?'current':''}>03 Results</span></nav><div className="format"><Gauge size={16}/><span>5v5 · 1 min = 1 sec</span></div></header>
}

function TeamHeader({side,name,setName,active,onClick}:{side:Side;name:string;setName:(name:string)=>void;active:boolean;onClick:()=>void}) {
  const [editingName, setEditingName] = useState(false)
  const [draft, setDraft] = useState(name)
  const save = () => { const next=draft.trim(); if(next) setName(next); setEditingName(false) }
  const startEdit = () => { setDraft(name); setEditingName(true) }
  return <div className={`team-header ${side} ${active?'active':''}`} onClick={onClick}><span className="team-badge"><Shield size={22}/></span><span><small>{side==='home'?'Home team':'Away team'}</small><span className="name-row">{editingName ? <input className="team-name-input" autoFocus onFocus={event=>event.target.select()} value={draft} maxLength={24} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')save();if(event.key==='Escape')setEditingName(false)}} aria-label={`${side==='home'?'Home':'Away'} team name`}/> : <b>{name}</b>}<button className="name-edit-btn" aria-label={editingName?'Save team name':'Edit team name'} onClick={event=>{event.stopPropagation();editingName?save():startEdit()}}>{editingName?<Check size={16}/>:<Pencil size={14}/>}</button></span></span>{active&&<span className="editing"><span/> editing</span>}</div>
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

function PlayerBrowser({activeName,searching,players,total,loadingMore,onLoadMore,query,setQuery,position,setPosition,activeSlot,lineup,onSelect,onCompare}:{activeName:string;searching:boolean;players:Player[];total:number;loadingMore:boolean;onLoadMore:()=>void;query:string;setQuery:(q:string)=>void;position:string;setPosition:(position:string)=>void;activeSlot:Slot;lineup:Lineup;onSelect:(p:Player)=>void;onCompare:(p:Player)=>void}) {
  return <section className="player-browser" aria-label="Player selection">
    <div className="browser-title"><div><p className="eyebrow">Player library</p><h2>Choose for <span>{activeName} · {activeSlot}</span></h2></div><span className="count">{searching ? 'Searching…' : `${players.length.toLocaleString()} of ${total.toLocaleString()}`}</span></div>
    <label className="search-box"><Search size={18}/><span className="sr-only">Search players</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search player, club, or year…"/></label>
    <div className="filter-row" role="group" aria-label="Filter by position">{['ALL','GK','CB','CM','CAM','LW','RW','ST'].map(p=><button className={position===p?'active':''} onClick={()=>setPosition(p)} key={p}>{p}</button>)}</div>
    <div className="player-list" aria-busy={searching}>{searching ? <div className="empty-search" role="status">Searching players…</div> : players.length ? players.map(player => { const used=Object.values(lineup).some(p=>p?.id===player.id); return <article className={`player-card ${used?'used':''}`} key={`${player.id}:${player.version}`}>
      <button className="player-card-main" title={player.fullName??player.name} disabled={used} onClick={()=>onSelect(player)} aria-label={`${used?'Already selected':'Add'} ${player.fullName??player.name}, ${formatVersion(player.version)}`}><span className="card-rating"><b>{player.rating}</b><small>{player.position}</small></span><span className="card-avatar">{initials(player.name)}</span><span className="card-identity"><b>{player.name}</b><small>{player.club} · {player.nationality}</small><span>{formatVersion(player.version)}</span></span><span className="mini-stats"><small><b>{player.pace}</b>PAC</small><small><b>{player.shooting}</b>SHO</small><small><b>{player.passing}</b>PAS</small></span><span className="add-player">{used?<Check size={16}/>:<span>+</span>}</span></button><button className="compare-player" onClick={()=>onCompare(player)} aria-label={`Compare FIFA versions of ${player.name}`} title="Compare FIFA versions"><GitCompareArrows size={16}/></button>
    </article>}) : <div className="empty-search"><Search size={26}/><b>No players found</b><span>Try a name, club, or a different position.</span></div>}{!searching && players.length < total && <button className="load-more" disabled={loadingMore} onClick={onLoadMore}>{loadingMore ? 'Loading…' : `Load more (${total-players.length} remaining)`}</button>}</div>
    <div className="browser-foot"><span><Sparkles size={15}/> Historical versions are rated independently</span><button onClick={()=>{setQuery('');setPosition('ALL')}}>Clear filters</button></div>
  </section>
}

const initials=(name:string)=>name.split(' ').map(n=>n[0]).slice(0,2).join('')
const lastName=(name:string)=>name.split(' ').at(-1) || name
const formatVersion=(version:string)=>version.toUpperCase().startsWith('FIFA') ? version : `FIFA ${version}`
