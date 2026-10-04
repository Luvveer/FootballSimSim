import { useEffect, useRef, useState } from 'react'
import { PITCH_ROLES, type PitchRole } from '@footballsimsim/shared'
import { Check, ChevronLeft, ChevronRight, CircleDot, Gauge, GitCompareArrows, Pencil, Play, Search, Shield, Sparkles, X } from 'lucide-react'
import { fetchPlayers, simulateMatch } from './api'
import { MatchReplay } from './MatchReplay'
import { PlayerComparison } from './PlayerComparison'
import { Results } from './Results'
import { DEFAULT_FORMATION, FORMATIONS, roleLabel, slotLabel } from './formations'
import { assignPlayer, emptyLineup, isLineupComplete, lineupFilledCount, lineupHasPlayer, resolveActiveSlot } from './lineup'
import type { Lineup, MatchResult, Player, Side, Slot } from './types'

export function App() {
  const [view, setView] = useState<'builder'|'match'|'result'>('builder')
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }) }, [view])
  const [players, setPlayers] = useState<Player[]>([])
  const [playerTotal, setPlayerTotal] = useState(0)
  const [homeFormation, setHomeFormation] = useState(DEFAULT_FORMATION)
  const [awayFormation, setAwayFormation] = useState(DEFAULT_FORMATION)
  const [home, setHome] = useState<Lineup>(() => emptyLineup(DEFAULT_FORMATION))
  const [away, setAway] = useState<Lineup>(() => emptyLineup(DEFAULT_FORMATION))
  const [activeSide, setActiveSide] = useState<Side>('home')
  const [activeSlot, setActiveSlot] = useState<Slot>('ST')
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState<PitchRole|'ALL'>('ALL')
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
  const ready = isLineupComplete(home, homeFormation) && isLineupComplete(away, awayFormation)
  const filled = lineupFilledCount(home, homeFormation) + lineupFilledCount(away, awayFormation)

  const activateSide = (side: Side) => {
    const formation = side === 'home' ? homeFormation : awayFormation
    const lineup = side === 'home' ? home : away
    setActiveSide(side)
    setActiveSlot(current => resolveActiveSlot(formation, lineup, current))
  }

  const selectPlayer = (player: Player) => {
    const lineup = activeSide === 'home' ? home : away
    const setter = activeSide === 'home' ? setHome : setAway
    const formation = activeSide === 'home' ? homeFormation : awayFormation
    if (lineupHasPlayer(lineup, formation, player.id)) return
    const next = assignPlayer(lineup, formation, activeSlot, player)
    setter(next.lineup)
    setActiveSlot(next.nextSlot)
  }

  const changeFormation = (side: Side, formation: string) => {
    const lineup = side === 'home' ? home : away
    const next = emptyLineup(formation)
    for (const id of Object.keys(next)) next[id] = lineup[id] ?? null
    if (side === 'home') { setHomeFormation(formation); setHome(next) } else { setAwayFormation(formation); setAway(next) }
    setActiveSide(side)
    setActiveSlot(FORMATIONS[formation].find(slot => !next[slot.id])?.id ?? FORMATIONS[formation][0].id)
  }

  const start = async () => {
    if (!ready) return
    setLoading(true)
    setMatchError(null)
    try {
      const match = await simulateMatch(homeName.trim() || 'Home', awayName.trim() || 'Away', home, away, homeFormation, awayFormation)
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
        {ready
          ? <button className="progress-chip ready" disabled={loading} onClick={start}><span>{loading ? <span className="spinner"/> : <Play size={26} fill="currentColor"/>}</span><div><b>{loading ? 'Building match…' : 'Start match'}</b><small>Both teams ready</small></div></button>
          : <div className="progress-chip"><span>{filled}</span><div><b>of 10 selected</b><small>Two complete teams</small></div></div>}
      </section>

      {playersLoading && <div className="status-banner" role="status">Loading historical players…</div>}
      {playerError && <div className="status-banner error" role="alert"><span>{playerError} Make sure the API is running on port 3001.</span><button onClick={() => setReloadPlayers(value => value + 1)}>Try again</button></div>}
      {matchError && <div className="status-banner error" role="alert"><span>{matchError}</span><button onClick={() => void start()}>Try match again</button></div>}

      <div className="builder-grid">
        <div className="team-column"><TeamHeader side="home" name={homeName} formation={homeFormation} setName={setHomeName} active={activeSide==='home'} onClick={() => activateSide('home')} /><Pitch side="home" formation={homeFormation} onFormation={f => changeFormation('home', f)} lineup={home} activeSlot={activeSide==='home' ? activeSlot : null} onSlot={setActiveSlot} onRemove={slot => setHome({...home,[slot]:null})} onActivate={() => activateSide('home')} /></div>
        <PlayerBrowser activeName={activeSide==='home'?homeName:awayName} searching={searchPending} players={players} total={playerTotal} loadingMore={loadingMore} onLoadMore={loadMorePlayers} query={query} setQuery={setQuery} position={position} setPosition={setPosition} activeSlot={activeSlot} formation={activeSide==='home'?homeFormation:awayFormation} lineup={activeSide==='home'?home:away} onSelect={selectPlayer} onCompare={setComparisonPlayer} />
        <div className="team-column"><TeamHeader side="away" name={awayName} formation={awayFormation} setName={setAwayName} active={activeSide==='away'} onClick={() => activateSide('away')} /><Pitch side="away" formation={awayFormation} onFormation={f => changeFormation('away', f)} lineup={away} activeSlot={activeSide==='away' ? activeSlot : null} onSlot={setActiveSlot} onRemove={slot => setAway({...away,[slot]:null})} onActivate={() => activateSide('away')} /></div>
      </div>
    </main>
    {comparisonPlayer && <PlayerComparison player={comparisonPlayer} onClose={() => setComparisonPlayer(null)} />}
  </div>
}

export function Header({ step }:{ step:'build'|'match'|'result' }) {
  return <header className="topbar"><a className="brand" href="#" aria-label="FootballSimSim home"><span className="brand-mark"><CircleDot size={22}/></span><span>FOOTBALL<span>SIM</span>SIM</span></a><nav aria-label="Match progress"><span className={step==='build'?'current':''}>01 Build</span><i/><span className={step==='match'?'current':''}>02 Match</span><i/><span className={step==='result'?'current':''}>03 Results</span></nav><div className="format"><Gauge size={16}/><span>5v5 · 1 min = 1 sec</span></div></header>
}

function TeamHeader({side,name,formation,setName,active,onClick}:{side:Side;name:string;formation:string;setName:(name:string)=>void;active:boolean;onClick:()=>void}) {
  const [editingName, setEditingName] = useState(false)
  const [draft, setDraft] = useState(name)
  const save = () => { const next=draft.trim(); if(next) setName(next); setEditingName(false) }
  const startEdit = () => { setDraft(name); setEditingName(true) }
  return <div className={`team-header ${side} ${active?'active':''}`} onClick={onClick}><span className="team-badge"><Shield size={22}/></span><span><small>{side==='home'?'Home team':'Away team'}</small><span className="name-row">{editingName ? <input className="team-name-input" autoFocus onFocus={event=>event.target.select()} value={draft} maxLength={24} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')save();if(event.key==='Escape')setEditingName(false)}} aria-label={`${side==='home'?'Home':'Away'} team name`}/> : <b>{name}</b>}<button className="name-edit-btn" aria-label={editingName?'Save team name':'Edit team name'} onClick={event=>{event.stopPropagation();editingName?save():startEdit()}}>{editingName?<Check size={16}/>:<Pencil size={14}/>}</button></span></span><span className="header-right"><span className="editing" style={{visibility:active?'visible':'hidden'}}><span/> editing</span><span className="formation-chip" title="Formation">{formation.replaceAll('-','–')}</span></span></div>
}

function Pitch({ side,formation,onFormation,lineup,activeSlot,onSlot,onRemove,onActivate }:{side:Side;formation:string;onFormation:(f:string)=>void;lineup:Lineup;activeSlot:Slot|null;onSlot:(s:Slot)=>void;onRemove:(s:Slot)=>void;onActivate:()=>void}) {
  const names = Object.keys(FORMATIONS)
  const step = (direction: number) => onFormation(names[(names.indexOf(formation) + direction + names.length) % names.length])
  return <div className={`pitch ${side}`} onClick={onActivate}>
    <div className="pitch-lines"><span className="center-line"/><span className="center-circle"/><span className="penalty top"/><span className="penalty bottom"/></div>
    {FORMATIONS[formation].map(({id:slot,role,left,top}) => <div className="pitch-slot" style={{left:`${left}%`,top:`${top}%`}} key={slot}>
      {lineup[slot] ? <div className={`selected-player ${activeSlot===slot?'active':''}`}><button className="player-select" onClick={(e)=>{e.stopPropagation();onSlot(slot);onActivate()}} aria-label={`${lineup[slot]!.name}, ${roleLabel(role)}. Select position`}><span className="mini-rating">{lineup[slot]!.rating}</span><span className="avatar">{initials(lineup[slot]!.name)}</span><span className="player-tag"><b>{lastName(lineup[slot]!.name)}</b><small>{formatVersion(lineup[slot]!.version)}</small></span></button><button className="remove" aria-label={`Remove ${lineup[slot]!.name}`} onClick={(e)=>{e.stopPropagation();onRemove(slot)}}><X size={13}/></button></div>
      : <button className={`empty-slot ${activeSlot===slot?'active':''}`} onClick={(e)=>{e.stopPropagation();onSlot(slot);onActivate()}}><span>+</span><b>{roleLabel(role)}</b></button>}
    </div>)}
    <button className="formation-arrow left" aria-label="Previous formation" onClick={e=>{e.stopPropagation();step(-1)}}><ChevronLeft size={20}/></button><button className="formation-arrow right" aria-label="Next formation" onClick={e=>{e.stopPropagation();step(1)}}><ChevronRight size={20}/></button>
  </div>
}

function PlayerBrowser({activeName,searching,players,total,loadingMore,onLoadMore,query,setQuery,position,setPosition,activeSlot,formation,lineup,onSelect,onCompare}:{activeName:string;searching:boolean;players:Player[];total:number;loadingMore:boolean;onLoadMore:()=>void;query:string;setQuery:(q:string)=>void;position:PitchRole|'ALL';setPosition:(position:PitchRole|'ALL')=>void;activeSlot:Slot;formation:string;lineup:Lineup;onSelect:(p:Player)=>void;onCompare:(p:Player)=>void}) {
  return <section className="player-browser" aria-label="Player selection">
    <div className="browser-title"><div><p className="eyebrow">Player library</p><h2>Choose for <span>{activeName} · {slotLabel(activeSlot)}</span></h2></div><span className="count">{searching ? 'Searching…' : `${players.length.toLocaleString()} of ${total.toLocaleString()}`}</span></div>
    <label className="search-box"><Search size={18}/><span className="sr-only">Search players</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search player, club, or year…"/></label>
    <div className="filter-row" role="group" aria-label="Filter by position">{(['ALL',...PITCH_ROLES] as const).map(p=><button className={position===p?'active':''} onClick={()=>setPosition(p)} key={p}>{p}</button>)}</div>
    <div className="player-list" aria-busy={searching}>{searching ? <div className="empty-search" role="status">Searching players…</div> : players.length ? players.map(player => { const used=lineupHasPlayer(lineup,formation,player.id); return <article className={`player-card ${used?'used':''}`} key={player.id}>
      <button className="player-card-main" title={player.fullName??player.name} disabled={used} onClick={()=>onSelect(player)} aria-label={`${used?'Already selected':'Add'} ${player.fullName??player.name}, ${formatVersion(player.version)}`}><span className="card-rating"><b>{player.rating}</b><small>{player.position}</small></span><span className="card-avatar">{initials(player.name)}</span><span className="card-identity"><b>{player.name}</b><small>{player.club} · {player.nationality}</small><span>{formatVersion(player.version)}</span></span><span className="mini-stats">{player.position==='GK'&&player.gk ? <><small><b>{player.gk.diving}</b>DIV</small><small><b>{player.gk.reflexes}</b>REF</small><small><b>{player.gk.handling}</b>HAN</small><small><b>{player.gk.speed}</b>SPE</small><small><b>{player.gk.kicking}</b>KIC</small><small><b>{player.gk.positioning}</b>POS</small></> : <><small><b>{player.pace}</b>PAC</small><small><b>{player.shooting}</b>SHO</small><small><b>{player.passing}</b>PAS</small><small><b>{player.dribbling}</b>DRI</small><small><b>{player.defending}</b>DEF</small><small><b>{player.physical}</b>PHY</small></>}</span><span className="add-player">{used?<Check size={16}/>:<span>+</span>}</span></button><button className="compare-player" onClick={()=>onCompare(player)} aria-label={`Compare FIFA versions of ${player.name}`} title="Compare FIFA versions"><GitCompareArrows size={16}/></button>
    </article>}) : <div className="empty-search"><Search size={26}/><b>No players found</b><span>Try a name, club, or a different position.</span></div>}{!searching && players.length < total && <button className="load-more" disabled={loadingMore} onClick={onLoadMore}>{loadingMore ? 'Loading…' : `Load more (${total-players.length} remaining)`}</button>}</div>
    <div className="browser-foot"><span><Sparkles size={15}/> Historical versions are rated independently</span><button onClick={()=>{setQuery('');setPosition('ALL')}}>Clear filters</button></div>
  </section>
}

const initials=(name:string)=>name.split(' ').map(n=>n[0]).slice(0,2).join('')
const lastName=(name:string)=>name.split(' ').at(-1) || name
const formatVersion=(version:string)=>{ const v=version.replace(/\.0+$/,''); return v.toUpperCase().startsWith('FIFA') ? v : `FIFA ${v}` }
