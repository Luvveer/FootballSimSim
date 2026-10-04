import { useEffect, useRef, useState } from 'react'
import { PITCH_ROLES, type PitchRole } from '@footballsimsim/shared'
import { ArrowLeftRight, Check, CircleDot, Eraser, MousePointerClick, Pencil, Play, Search, Shield, Shuffle, X } from 'lucide-react'
import { fetchPlayers, fetchVersions, simulateMatch } from './api'
import { VersionFilter } from './VersionFilter'
import { FormationPicker } from './FormationPicker'
import { versionLabel } from './version-label'
import { MatchReplay } from './MatchReplay'
import { PlayerComparison } from './PlayerComparison'
import { PlayerStatsDialog } from './PlayerStatsDialog'
import { Landing } from './Landing'
import { routeTitle, useRoute } from './route'
import { Results } from './Results'
import { DEFAULT_FORMATION, FORMATIONS, roleLabel, slotLabel } from './formations'
import { assignPlayer, emptyLineup, firstAvailableSlot, isLineupComplete, lineupFilledCount, lineupHasPlayer, remapLineup, resolveActiveSlot } from './lineup'
import type { Lineup, MatchResult, Player, Side, Slot } from './types'

const BUILD_STEPS = [
  { icon: Search, title: 'Search', text: 'Find any player by name, club or year. Filter by position or edition, and use the magnifier for full stats.' },
  { icon: MousePointerClick, title: 'Add', text: 'Click a player to add them to the selected team, or drag them onto any spot on the pitch.' },
  { icon: ArrowLeftRight, title: 'Rearrange', text: 'Drag a placed player onto another to swap them, or change the formation at any time.' },
  { icon: Shuffle, title: 'Autofill & Play', text: 'Autofill fills the empty spots. Once you have 10 players, start the match.' },
]

type DragSource = { kind: 'library'; player: Player } | { kind: 'slot'; side: Side; slot: Slot }

export function App() {
  const [view, setView] = useState<'builder'|'match'|'result'>('builder')
  const [route, navigate] = useRoute()
  useEffect(() => { document.title = routeTitle[route] }, [route])
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }) }, [view])
  const [players, setPlayers] = useState<Player[]>([])
  const [playerTotal, setPlayerTotal] = useState(0)
  const [homeFormation, setHomeFormation] = useState(DEFAULT_FORMATION)
  const [awayFormation, setAwayFormation] = useState(DEFAULT_FORMATION)
  const [home, setHome] = useState<Lineup>(() => emptyLineup(DEFAULT_FORMATION))
  const [away, setAway] = useState<Lineup>(() => emptyLineup(DEFAULT_FORMATION))
  const [activeSide, setActiveSide] = useState<Side>('home')
  const [activeSlot, setActiveSlot] = useState<Slot | null>(null)
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState<PitchRole|'ALL'>('ALL')
  const [versions, setVersions] = useState<string[]>([])
  const dragRef = useRef<DragSource | null>(null)
  const keepFilterRef = useRef(false)
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const [ghost, setGhost] = useState<{ player: Player; x: number; y: number } | null>(null)
  const [dragFrom, setDragFrom] = useState<{ side: Side; slot: Slot } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  // searchMode: nothing is picked, so the library only browses players ("Search for players"). Otherwise a team is being built.
  const [searchMode, setSearchMode] = useState(true)
  // A short guided tour of the how-to steps, shown only when arriving from the landing page. Each click advances the highlight.
  const [tourStep, setTourStep] = useState<number | null>(null)
  const tourStartedAt = useRef(0)
  const [randomizing, setRandomizing] = useState<Record<Side, boolean>>({ home: false, away: false })
  const lineupsRef = useRef({ home: {} as Lineup, away: {} as Lineup })
  const [availableVersions, setAvailableVersions] = useState<string[]>([])
  const [result, setResult] = useState<MatchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [playersLoading, setPlayersLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [playerError, setPlayerError] = useState<string | null>(null)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [reloadPlayers, setReloadPlayers] = useState(0)
  const [comparisonPlayer, setComparisonPlayer] = useState<Player | null>(null)
  const [statsPlayer, setStatsPlayer] = useState<Player | null>(null)
  const [homeName, setHomeName] = useState('Home Team')
  const [awayName, setAwayName] = useState('Away Team')

  useEffect(() => { fetchVersions().then(setAvailableVersions).catch(() => setAvailableVersions([])) }, [reloadPlayers])
  const playerRequest = useRef<AbortController | null>(null)
  const [loadedFilters, setLoadedFilters] = useState('')
  const filterKey = JSON.stringify([query, position, versions, reloadPlayers])
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
        const page = await fetchPlayers(query, position, 0, controller.signal, versions)
        if (controller.signal.aborted) return
        setLoadedFilters(JSON.stringify([query, position, versions, reloadPlayers]))
        setPlayers(page.players)
        setPlayerTotal(page.total)
      } catch (error) {
        if (controller.signal.aborted) return
        setLoadedFilters(JSON.stringify([query, position, versions, reloadPlayers]))
        setPlayerTotal(0)
        setPlayers([])
        setPlayerError(error instanceof Error ? error.message : 'Could not load players.')
      } finally {
        if (!controller.signal.aborted) setPlayersLoading(false)
      }
    }, query ? 250 : 0)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query, position, versions, reloadPlayers])

  const loadMorePlayers = async () => {
    const controller = playerRequest.current
    if (searchPending || loadingMore || !controller || controller.signal.aborted || players.length >= playerTotal) return
    setLoadingMore(true)
    setPlayerError(null)
    try {
      const page = await fetchPlayers(query, position, players.length, controller.signal, versions)
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
  lineupsRef.current = { home, away }
  const filled = lineupFilledCount(home, homeFormation) + lineupFilledCount(away, awayFormation)

  const activateSide = (side: Side) => {
    const formation = side === 'home' ? homeFormation : awayFormation
    const lineup = side === 'home' ? home : away
    setActiveSide(side)
    if (searchMode) { setSearchMode(false); return }
    setActiveSlot(current => current && resolveActiveSlot(formation, lineup, current))
  }

  // Clicking an empty part of a pitch picks that team without picking a position.
  const pickTeam = (side: Side) => { setActiveSide(side); setActiveSlot(null); setSearchMode(false) }

  useEffect(() => { if (activeSlot) setSearchMode(false) }, [activeSlot])

  // When the team being filled is complete, move on to the other team's first empty spot. Returns true if it switched.
  const advanceIfComplete = (side: Side, lineup: Lineup) => {
    const formations = { home: homeFormation, away: awayFormation }
    if (!isLineupComplete(lineup, formations[side])) return false
    const other: Side = side === 'home' ? 'away' : 'home'
    const otherLineup = other === 'home' ? home : away
    if (isLineupComplete(otherLineup, formations[other])) return false
    setActiveSide(other)
    setActiveSlot(firstAvailableSlot(formations[other], otherLineup))
    return true
  }

  const selectPlayer = (player: Player) => {
    const lineup = activeSide === 'home' ? home : away
    const setter = activeSide === 'home' ? setHome : setAway
    const formation = activeSide === 'home' ? homeFormation : awayFormation
    if (lineupHasPlayer(lineup, formation, player.id)) return
    const next = assignPlayer(lineup, formation, activeSlot ?? firstAvailableSlot(formation, lineup), player)
    setter(next.lineup)
    if (!advanceIfComplete(activeSide, next.lineup)) setActiveSlot(next.nextSlot)
  }

  const changeFormation = (side: Side, formation: string) => {
    const lineup = side === 'home' ? home : away
    const previousFormation = side === 'home' ? homeFormation : awayFormation
    const next = remapLineup(lineup, previousFormation, formation)
    if (side === 'home') { setHomeFormation(formation); setHome(next) } else { setAwayFormation(formation); setAway(next) }
    setActiveSide(side)
    setActiveSlot(firstAvailableSlot(formation, next))
  }

  // The position filter follows the selected pitch slot (FWD slot -> FWD filter), and resets to ALL when no slot is selected.
  useEffect(() => {
    const formation = activeSide === 'home' ? homeFormation : awayFormation
    const role = activeSlot ? FORMATIONS[formation]?.find(slot => slot.id === activeSlot)?.role : undefined
    // While a player is being dragged the filter stays put. It updates once the drop (or cancel) selects a spot.
    if (dragging) return
    // A drag that started in the library leaves the filter exactly as it was, including after the drop.
    if (keepFilterRef.current) { keepFilterRef.current = false; return }
    setPosition(role ?? 'ALL')
  }, [activeSide, activeSlot, homeFormation, awayFormation, dragging])

  // Clicking anywhere outside the pitches, the player library and the team headers clears the selected position.
  useEffect(() => {
    const clearSlot = (event: MouseEvent) => {
      const target = event.target as Element | null
      if (!target?.closest('.pitch, .pitch-bar, .player-browser, .team-header, .comparison-dialog, .stats-dialog, .start-button, .progress-chip')) { setActiveSlot(null); setSearchMode(true); return }
      // Empty space inside the player library (not a control or a player row) also goes back to "Search for players".
      if (target.closest('.player-browser') && !target.closest('button, input, select, a, label, article, .version-menu')) { setActiveSlot(null); setSearchMode(true) }
    }
    document.addEventListener('click', clearSlot)
    return () => document.removeEventListener('click', clearSlot)
  }, [])

  // The visual state is set on the next tick: changing the DOM inside dragstart makes Chrome cancel the drag.
  // Dragging uses pointer events instead of the browser's HTML5 drag and drop: the token that follows the cursor looks the
  // same in every browser, can't be cancelled by the page re-rendering, and is never clipped. Touch screens keep tap-to-pick.
  const dropRef = useRef<(side: Side, slot: Slot) => void>(() => undefined)
  const startPointerDrag = (event: React.PointerEvent, source: DragSource) => {
    if (event.button !== 0 || event.pointerType === 'touch' || (event.target as Element).closest('.remove')) return
    const player = source.kind === 'library' ? source.player : (source.side === 'home' ? home : away)[source.slot]
    if (!player) return
    const startX = event.clientX, startY = event.clientY
    const before = { side: activeSide, slot: activeSlot, search: searchMode }
    let started = false
    const slotAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-slot]')?.dataset.dropSlot ?? null
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', escape)
      document.body.classList.remove('is-dragging')
    }
    const finish = (x: number, y: number, cancelled: boolean) => {
      stop()
      if (!started) return
      if (source.kind === 'library') keepFilterRef.current = true
      const key = cancelled ? null : slotAt(x, y)
      if (key) { const [side, slot] = key.split(':'); dropRef.current(side as Side, slot as Slot) } else {
        // Released over nothing (or cancelled): the player returns to where they were and that spot is selected again.
        endDrag()
        if (source.kind === 'slot') { setActiveSide(source.side); setActiveSlot(source.slot); setSearchMode(false) }
        else { setActiveSide(before.side); setActiveSlot(before.slot); setSearchMode(before.search) }
      }
      // The click that follows a drag must not select or add anything.
      const swallow = (clickEvent: Event) => { clickEvent.stopPropagation(); clickEvent.preventDefault() }
      window.addEventListener('click', swallow, true)
      window.setTimeout(() => window.removeEventListener('click', swallow, true), 0)
    }
    function move(e: PointerEvent) {
      if (!started) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return
        started = true
        dragRef.current = source
        document.body.classList.add('is-dragging')
        // Starting a drag clears any selected position so two things are never highlighted at once.
        setActiveSlot(null)
        setSearchMode(true)
        setDragging(true)
        setGhost({ player: player!, x: e.clientX, y: e.clientY })
        if (source.kind === 'slot') setDragFrom({ side: source.side, slot: source.slot })
      }
      if (ghostRef.current) ghostRef.current.style.transform = `translate(${e.clientX - 44}px, ${e.clientY - 37}px)`
      const key = slotAt(e.clientX, e.clientY)
      setDropTarget(current => current === key ? current : key)
    }
    function up(e: PointerEvent) { finish(e.clientX, e.clientY, false) }
    function cancel(e: PointerEvent) { finish(e.clientX, e.clientY, true) }
    function escape(e: KeyboardEvent) { if (e.key === 'Escape') finish(0, 0, true) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', escape)
  }

  const endDrag = () => { dragRef.current = null; setDragging(false); setDropTarget(null); setGhost(null); setDragFrom(null) }

  // Drop a library player or a placed player on a pitch slot. Placing on an empty slot moves the player there; dropping a
  // placed player on an occupied slot swaps the two (also across teams). A library player dropped on an occupied slot replaces whoever was there.
  const dropOnSlot = (side: Side, slot: Slot) => {
    const source = dragRef.current
    endDrag()
    if (!source) return
    const lineups = { home, away }
    const formations = { home: homeFormation, away: awayFormation }
    const setLineup = (target: Side, lineup: Lineup) => (target === 'home' ? setHome : setAway)(lineup)
    const targetLineup = lineups[side]
    // Whatever spot the player ends up in becomes the selected one.
    const landed: { side: Side; slot: Slot } = { side, slot }
    if (source.kind === 'library') {
      if (lineupHasPlayer(targetLineup, formations[side], source.player.id)) return
      const updated = { ...targetLineup, [slot]: source.player }
      setLineup(side, updated)
      if (advanceIfComplete(side, updated)) return
    } else {
      if (source.side === side && source.slot === slot) { setActiveSide(side); setActiveSlot(slot); return }
      const moving = lineups[source.side][source.slot]
      if (!moving) return
      if (source.side === side) {
        // Same team: dropping on an occupied spot swaps the two players.
        setLineup(side, { ...targetLineup, [slot]: moving, [source.slot]: targetLineup[slot] ?? null })
      } else {
        // Other team: the dropped player takes the spot they land on, and whoever was there (if anyone) takes their old spot.
        setLineup(source.side, { ...lineups[source.side], [source.slot]: targetLineup[slot] ?? null })
        setLineup(side, { ...targetLineup, [slot]: moving })
      }
    }
    setActiveSide(landed.side)
    setActiveSlot(landed.slot)
  }

  // While the tour is showing, every click is swallowed (nothing under the cursor reacts) and only moves the highlight on.
  useEffect(() => {
    if (tourStep === null) return
    const swallow = (event: Event) => { event.stopPropagation() }
    const onMouseDown = (event: MouseEvent) => { event.stopPropagation(); event.preventDefault() }
    const onClick = (event: MouseEvent) => {
      event.stopPropagation()
      event.preventDefault()
      // Ignore the click that opened this page (and any bounce right after it). Comparing event.timeStamp is unreliable across browsers.
      if (performance.now() - tourStartedAt.current < 500) return
      setTourStep(current => current === null || current >= BUILD_STEPS.length - 1 ? null : current + 1)
    }
    const stop = (event: KeyboardEvent) => { if (event.key === 'Escape') setTourStep(null) }
    window.addEventListener('pointerdown', swallow, true)
    window.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('click', onClick, true)
    window.addEventListener('keydown', stop)
    return () => {
      window.removeEventListener('pointerdown', swallow, true)
      window.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('keydown', stop)
    }
  }, [tourStep !== null])
  useEffect(() => { if (route === '/') setTourStep(null) }, [route])

  dropRef.current = dropOnSlot

  const clearTeam = (side: Side) => {
    const formation = side === 'home' ? homeFormation : awayFormation
    const next = emptyLineup(formation)
    if (side === 'home') setHome(next); else setAway(next)
    setActiveSide(side)
    setActiveSlot(firstAvailableSlot(formation, next))
  }

  // Fills every slot of a team with players picked uniformly at random from ALL players of that position
  // (any FIFA/FC edition, or just the selected versions). Each pick samples a random index in the full ordered result,
  // so every eligible player is equally likely. Players whose main position matches the slot are preferred through
  // rejection sampling, which keeps the draw uniform. Players already on either pitch are skipped.
  const randomizeTeam = async (side: Side) => {
    if (randomizing[side]) return
    const formation = side === 'home' ? homeFormation : awayFormation
    const slots = FORMATIONS[formation]
    const mine = new Set<string>()
    const isTaken = (id: string) => mine.has(id) || [...Object.values(lineupsRef.current.home), ...Object.values(lineupsRef.current.away)].some(player => player?.id === id)
    const totals = new Map<PitchRole, number>()
    const totalFor = async (role: PitchRole) => {
      if (!totals.has(role)) totals.set(role, (await fetchPlayers('', role, 0, undefined, versions)).total)
      return totals.get(role)!
    }
    const pickOne = async (role: PitchRole): Promise<Player | undefined> => {
      const count = await totalFor(role)
      let coversOnly: Player | undefined
      for (let attempt = 0; count > 0 && attempt < 25; attempt++) {
        const page = await fetchPlayers('', role, Math.floor(Math.random() * count), undefined, versions)
        const candidate = page.players[0]
        if (!candidate || isTaken(candidate.id)) continue
        if (candidate.position === role) return candidate
        coversOnly ??= candidate
      }
      return coversOnly
    }
    setRandomizing(current => ({ ...current, [side]: true }))
    setPlayerError(null)
    try {
      // Only the empty slots are filled. Players already on the pitch stay exactly where they are.
      const alreadyPlaced = lineupsRef.current[side]
      const picks = new Map<Slot, Player>()
      for (const slot of slots) {
        if (alreadyPlaced[slot.id]) continue
        const pick = await pickOne(slot.role)
        if (pick) { picks.set(slot.id, pick); mine.add(pick.id) }
      }
      const latest = lineupsRef.current[side]
      const next = emptyLineup(formation)
      for (const slot of slots) next[slot.id] = latest[slot.id] ?? picks.get(slot.id) ?? null
      if (side === 'home') setHome(next); else setAway(next)
      setActiveSide(side)
      setActiveSlot(firstAvailableSlot(formation, next))
    } catch (error) {
      setPlayerError(error instanceof Error ? error.message : 'Could not autofill the team.')
    } finally {
      setRandomizing(current => ({ ...current, [side]: false }))
    }
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

  const returnToBuilder = () => {
    if (view === 'builder') window.scrollTo({ top: 0, behavior: 'auto' })
    setView('builder')
    setResult(null)
    setComparisonPlayer(null)
    setMatchError(null)
  }

  // The logo always goes to the landing page. The match is discarded but the squads are kept.
  const goHome = () => { returnToBuilder(); navigate('/') }

  // Every visit from the landing page starts the builder from a clean slate and with the guided tour.
  const startFresh = () => {
    setHome(emptyLineup(DEFAULT_FORMATION)); setAway(emptyLineup(DEFAULT_FORMATION))
    setHomeFormation(DEFAULT_FORMATION); setAwayFormation(DEFAULT_FORMATION)
    setHomeName('Home Team'); setAwayName('Away Team')
    setQuery(''); setPosition('ALL'); setVersions([])
    setActiveSide('home'); setActiveSlot(null); setSearchMode(true)
    setResult(null); setView('builder'); setComparisonPlayer(null); setStatsPlayer(null); setMatchError(null); setPlayerError(null)
    tourStartedAt.current = performance.now(); setTourStep(0)
    navigate('/play')
  }

  if (route === '/') return <Landing onStart={startFresh} />
  if (view === 'match' && result) return <MatchReplay result={result} onComplete={() => setView('result')} onHome={goHome} onBuild={returnToBuilder} />
  if (view === 'result' && result) return <Results result={result} onReplay={() => setView('match')} onReset={returnToBuilder} onHome={goHome} onBuild={returnToBuilder} />

  return <div className="app-shell">
    {ghost && <div className="selected-player drag-follow" ref={ghostRef} aria-hidden="true" style={{ transform: `translate(${ghost.x - 44}px, ${ghost.y - 37}px)` }}><span className="mini-rating">{ghost.player.rating}</span><span className="avatar">{initials(ghost.player.name)}</span><span className="player-tag"><b>{lastName(ghost.player.name)}</b><small>{formatVersion(ghost.player.version)}</small></span></div>}
    <Header step="build" onHome={goHome} />
    <main className="builder-main">
      <section className="intro-row">
        <ol className="build-steps" aria-label="How to build your teams">
          {BUILD_STEPS.map((step, index) => <li key={step.title} className={tourStep === null ? '' : tourStep === index ? 'is-current' : 'is-dim'}>
            <span className="step-icon"><step.icon size={18}/></span>
            <div><b><i>{index + 1}</i>{step.title}</b><p>{step.text}</p></div>
          </li>)}
        </ol>
        <div className="intro-actions">
          <div className="progress-chip"><span>{filled}</span><div><b>of 10 Selected</b></div></div>
          <button className="start-button" disabled={!ready || loading} onClick={start}>{loading ? <span className="spinner"/> : <Play size={19} fill="currentColor"/>}{loading ? 'Building match…' : 'Start Match'}</button>
        </div>
      </section>

      {playerError && <div className="status-banner error" role="alert"><span>{playerError} Make sure the API is running on port 3001.</span><button onClick={() => setReloadPlayers(value => value + 1)}>Try again</button></div>}
      {matchError && <div className="status-banner error" role="alert"><span>{matchError}</span><button onClick={() => void start()}>Try match again</button></div>}

      <div className="builder-grid">
        <div className="team-column"><TeamHeader side="home" name={homeName} setName={setHomeName} active={activeSide==='home'} onClick={() => activateSide('home')} /><div className="pitch-bar"><button className="bar-btn bar-left" disabled={randomizing.home} onClick={() => void randomizeTeam('home')} aria-label="Autofill home team" title="Autofill team"><Shuffle size={14}/><span>{randomizing.home ? 'Picking…' : 'Autofill'}</span></button><FormationPicker value={homeFormation} onChange={f => changeFormation('home', f)} teamName={homeName}/><button className="bar-btn bar-right" onClick={() => clearTeam('home')} aria-label="Clear home team" title="Clear all selections"><Eraser size={14}/><span>Clear</span></button></div><Pitch side="home" formation={homeFormation} lineup={home} activeSlot={activeSide==='home' ? activeSlot : null} onSlot={setActiveSlot} onRemove={slot => setHome({...home,[slot]:null})} onActivate={() => activateSide('home')} onEmptyClick={() => pickTeam('home')} dragging={dragging} dropSlot={dropTarget?.startsWith('home:') ? dropTarget.slice(5) : null} dragFromSlot={dragFrom?.side === 'home' ? dragFrom.slot : null} onPressSlot={(slot, event) => startPointerDrag(event, { kind: 'slot', side: 'home', slot })} /></div>
        <PlayerBrowser activeName={activeSide==='home'?homeName:awayName} searching={searchPending} players={players} total={playerTotal} loadingMore={loadingMore} onLoadMore={loadMorePlayers} query={query} setQuery={setQuery} position={position} setPosition={setPosition} versions={versions} setVersions={setVersions} availableVersions={availableVersions} activeSlot={activeSlot} searchMode={searchMode} formation={activeSide==='home'?homeFormation:awayFormation} lineup={activeSide==='home'?home:away} onSelect={selectPlayer} onPressPlayer={(player, event) => startPointerDrag(event, { kind: 'library', player })} onInspect={setStatsPlayer} onCompare={setComparisonPlayer} />
        <div className="team-column"><TeamHeader side="away" name={awayName} setName={setAwayName} active={activeSide==='away'} onClick={() => activateSide('away')} /><div className="pitch-bar"><button className="bar-btn bar-left" disabled={randomizing.away} onClick={() => void randomizeTeam('away')} aria-label="Autofill away team" title="Autofill team"><Shuffle size={14}/><span>{randomizing.away ? 'Picking…' : 'Autofill'}</span></button><FormationPicker value={awayFormation} onChange={f => changeFormation('away', f)} teamName={awayName}/><button className="bar-btn bar-right" onClick={() => clearTeam('away')} aria-label="Clear away team" title="Clear all selections"><Eraser size={14}/><span>Clear</span></button></div><Pitch side="away" formation={awayFormation} lineup={away} activeSlot={activeSide==='away' ? activeSlot : null} onSlot={setActiveSlot} onRemove={slot => setAway({...away,[slot]:null})} onActivate={() => activateSide('away')} onEmptyClick={() => pickTeam('away')} dragging={dragging} dropSlot={dropTarget?.startsWith('away:') ? dropTarget.slice(5) : null} dragFromSlot={dragFrom?.side === 'away' ? dragFrom.slot : null} onPressSlot={(slot, event) => startPointerDrag(event, { kind: 'slot', side: 'away', slot })} /></div>
      </div>
    </main>
    {statsPlayer && <PlayerStatsDialog player={statsPlayer} onClose={() => setStatsPlayer(null)} />}
    {comparisonPlayer && <PlayerComparison player={comparisonPlayer} onClose={() => setComparisonPlayer(null)} />}
  </div>
}

export function Header({ step,onHome,onBuild }:{ step:'build'|'match'|'result';onHome:()=>void;onBuild?:()=>void }) {
  return <header className="topbar"><button type="button" className="brand" onClick={onHome} aria-label="FootballSimSim home"><span className="brand-mark"><CircleDot size={22}/></span><span>FOOTBALL<span>SIM</span>SIM</span></button><nav aria-label="Match progress"><span className={step==='build'?'current':''}>01 Build</span><i/><span className={step==='match'?'current':''}>02 Match</span><i/><span className={step==='result'?'current':''}>03 Results</span></nav>{step !== 'build' && onBuild ? <button type="button" className="header-action" onClick={onBuild}>Build Team</button> : <span/>}</header>
}

function TeamHeader({side,name,setName,active,onClick}:{side:Side;name:string;setName:(name:string)=>void;active:boolean;onClick:()=>void}) {
  const [editingName, setEditingName] = useState(false)
  const [draft, setDraft] = useState(name)
  const save = () => { const next=draft.trim(); if(next) setName(next); setEditingName(false) }
  const startEdit = () => { setDraft(name); setEditingName(true) }
  return <div className={`team-header ${side} ${active?'active':''}`} onClick={onClick}><span className="team-badge"><Shield size={22}/></span><span><small>{side==='home'?'Home team':'Away team'}</small><span className="name-row">{editingName ? <input className="team-name-input" autoFocus onFocus={event=>event.target.select()} value={draft} maxLength={24} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')save();if(event.key==='Escape')setEditingName(false)}} aria-label={`${side==='home'?'Home':'Away'} team name`}/> : <b>{name}</b>}<button className="name-edit-btn" aria-label={editingName?'Save team name':'Edit team name'} onClick={event=>{event.stopPropagation();editingName?save():startEdit()}}>{editingName?<Check size={16}/>:<Pencil size={14}/>}</button></span></span></div>
}

function Pitch({ side,formation,lineup,activeSlot,onSlot,onRemove,onActivate,onEmptyClick,dragging,dropSlot,dragFromSlot,onPressSlot }:{side:Side;formation:string;lineup:Lineup;activeSlot:Slot|null;onSlot:(s:Slot)=>void;onRemove:(s:Slot)=>void;onActivate:()=>void;onEmptyClick:()=>void;dragging:boolean;dropSlot:Slot|null;dragFromSlot:Slot|null;onPressSlot:(s:Slot,e:React.PointerEvent)=>void}) {
  return <div className={`pitch ${side}`} onClick={onEmptyClick}>
    <div className="pitch-lines"><span className="center-line"/><span className="center-circle"/><span className="penalty top"/><span className="penalty bottom"/></div>
    {FORMATIONS[formation].map(({id:slot,role,left,top}) => <div className={`pitch-slot ${dragging ? 'can-drop' : ''} ${dropSlot===slot ? 'drop-over' : ''}`} style={{left:`${left}%`,top:`${top}%`}} key={slot} data-drop-slot={`${side}:${slot}`}>
      {lineup[slot] ? <div className={`selected-player ${activeSlot===slot?'active':''} ${dragFromSlot===slot?'lifted':''}`} onPointerDown={e=>onPressSlot(slot,e)} onDragStart={e=>e.preventDefault()}><button className="player-select" onClick={(e)=>{e.stopPropagation();onSlot(slot);onActivate()}} aria-label={`${lineup[slot]!.name}, ${roleLabel(role)}. Select position`}><span className="mini-rating">{lineup[slot]!.rating}</span><span className="avatar">{initials(lineup[slot]!.name)}</span><span className="player-tag"><b>{lastName(lineup[slot]!.name)}</b><small>{formatVersion(lineup[slot]!.version)}</small></span></button><button className="remove" aria-label={`Remove ${lineup[slot]!.name}`} onClick={(e)=>{e.stopPropagation();onRemove(slot)}}><X size={16} strokeWidth={2.6}/></button></div>
      : <button className={`empty-slot ${activeSlot===slot?'active':''}`} onClick={(e)=>{e.stopPropagation();onSlot(slot);onActivate()}}><span>+</span><b>{roleLabel(role)}</b></button>}
    </div>)}
  </div>
}

function PlayerBrowser({activeName,searching,players,total,loadingMore,onLoadMore,query,setQuery,position,setPosition,versions,setVersions,availableVersions,activeSlot,searchMode,formation,lineup,onSelect,onPressPlayer,onInspect,onCompare}:{activeName:string;searching:boolean;players:Player[];total:number;loadingMore:boolean;onLoadMore:()=>void;query:string;setQuery:(q:string)=>void;position:PitchRole|'ALL';setPosition:(position:PitchRole|'ALL')=>void;versions:string[];setVersions:(versions:string[])=>void;availableVersions:string[];activeSlot:Slot|null;searchMode:boolean;formation:string;lineup:Lineup;onSelect:(p:Player)=>void;onPressPlayer:(p:Player,e:React.PointerEvent)=>void;onInspect:(p:Player)=>void;onCompare:(p:Player)=>void}) {
  const browsing = searchMode
  return <section className="player-browser" aria-label="Player selection">
    <div className="browser-title"><div><p className="eyebrow">Player library</p><h2>{browsing ? 'Search for players' : <>Choose for <span>{activeName}{activeSlot ? ` · ${slotLabel(activeSlot)}` : ''}</span></>}</h2></div><span className="count">{searching ? 'Searching…' : `${players.length.toLocaleString()} of ${total.toLocaleString()}`}</span></div>
    <label className="search-box"><Search size={18}/><span className="sr-only">Search players</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search player, club, or year…"/></label>
    <div className="filter-bar"><div className="filter-row" role="group" aria-label="Filter by position">{(['ALL',...PITCH_ROLES] as const).map(p=><button className={position===p?'active':''} onClick={()=>setPosition(p)} key={p}>{p}</button>)}</div><VersionFilter available={availableVersions} selected={versions} onChange={setVersions}/></div>
    <div className="player-list" aria-busy={searching}>{searching ? <div className="empty-search" role="status">Searching players…</div> : players.length ? players.map(player => { const used=lineupHasPlayer(lineup,formation,player.id); return <article className={`player-card ${used?'used':''}`} key={player.id} onPointerDown={e=>{ if(!used) onPressPlayer(player,e) }} onDragStart={e=>e.preventDefault()}>
      <button className="player-card-main" title={player.fullName??player.name} disabled={used && !browsing} onClick={()=>browsing ? onInspect(player) : onSelect(player)} aria-label={`${browsing?'View stats for':used?'Already selected':'Add'} ${player.fullName??player.name}, ${formatVersion(player.version)}`}><span className="card-rating"><b>{player.rating}</b>{player.positions.map(position=><small key={position}>{position}</small>)}</span><span className="card-avatar">{initials(player.name)}</span><span className="card-identity"><b>{player.name}</b><small>{player.club} · {player.nationality}</small><span>{formatVersion(player.version)}</span></span><span className="mini-stats">{player.position==='GK' ? <><small><b>{player.gk?.diving??'—'}</b>DIV</small><small><b>{player.gk?.reflexes??'—'}</b>REF</small><small><b>{player.gk?.handling??'—'}</b>HAN</small><small><b>{player.gk?.speed??'—'}</b>SPE</small><small><b>{player.gk?.kicking??'—'}</b>KIC</small><small><b>{player.gk?.positioning??'—'}</b>POS</small></> : <><small><b>{player.pace}</b>PAC</small><small><b>{player.shooting}</b>SHO</small><small><b>{player.passing}</b>PAS</small><small><b>{player.dribbling}</b>DRI</small><small><b>{player.defending}</b>DEF</small><small><b>{player.physical}</b>PHY</small></>}</span><span className={`add-player ${used ? '' : 'placeholder'}`}>{used ? <Check size={16}/> : null}</span></button>
      {!used && <button className="inspect-player" onClick={()=>onInspect(player)} aria-label={`View stats for ${player.fullName??player.name}, ${formatVersion(player.version)}`} title="View stats"><Search size={16}/></button>}
    </article>}) : <div className="empty-search"><Search size={26}/><b>No players found</b><span>Try a name, club, or a different position.</span></div>}{!searching && players.length < total && <button className="load-more" disabled={loadingMore} onClick={onLoadMore}>{loadingMore ? 'Loading…' : `Load more (${total-players.length} remaining)`}</button>}</div>
  </section>
}

const initials=(name:string)=>name.split(' ').map(n=>n[0]).slice(0,2).join('')
const lastName=(name:string)=>name.split(' ').at(-1) || name
const formatVersion=versionLabel
