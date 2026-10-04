import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { fetchPlayerVersions } from './api'
import { versionLabel } from './version-label'
import type { Player } from './types'

type Row = [label: string, value: number | undefined]

const initials = (name: string) => name.trim().split(/\s+/).filter(word => !['da', 'de', 'dos', 'do'].includes(word.toLowerCase())).slice(0, 2).map(word => word[0]).join('')
const stars = (count: number) => '★'.repeat(Math.max(0, Math.min(5, count))) + '☆'.repeat(Math.max(0, 5 - count))

function headlineRows(player: Player): Row[] {
  if (player.position === 'GK' && player.gk) {
    return [['Diving', player.gk.diving], ['Reflexes', player.gk.reflexes], ['Handling', player.gk.handling], ['Speed', player.gk.speed], ['Kicking', player.gk.kicking], ['Positioning', player.gk.positioning]]
  }
  return [['Pace', player.pace], ['Shooting', player.shooting], ['Passing', player.passing], ['Dribbling', player.dribbling], ['Defending', player.defending], ['Physical', player.physical]]
}

// Outfield players get the full attribute breakdown. Goalkeepers already show their six goalkeeping stats
// above, so they get the mental and physical traits that matter in goal instead.
function attributeGroups(player: Player): { title: string; rows: Row[] }[] {
  const a = player.attributes
  if (!a) return []
  if (player.position === 'GK') {
    return [{ title: 'Keeper traits', rows: [['Reactions', a.reactions], ['Agility', a.agility], ['Composure', a.composure], ['Vision', a.vision], ['Strength', a.strength], ['Stamina', a.stamina]] }]
  }
  return [
    { title: 'Attacking', rows: [['Finishing', a.finishing], ['Positioning', a.positioning], ['Penalties', a.penalties]] },
    { title: 'Skill', rows: [['Ball control', a.ballControl], ['Vision', a.vision], ['Composure', a.composure], ['Reactions', a.reactions]] },
    { title: 'Physical', rows: [['Agility', a.agility], ['Stamina', a.stamina], ['Strength', a.strength]] },
    { title: 'Defending', rows: [['Interceptions', a.interceptions], ['Tackling', a.standingTackle], ['Aggression', a.aggression]] },
  ]
}

function StatLines({ rows }: { rows: Row[] }) {
  return <div className="stat-lines">{rows.map(([label, value]) => <div className="stat-line" key={label}><span>{label}</span><b>{value ?? '—'}</b></div>)}</div>
}

function RatingTimeline({ player }: { player: Player }) {
  const [editions, setEditions] = useState<Player[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetchPlayerVersions(player.playerId, controller.signal)
      .then(items => setEditions([...items].sort((a, b) => Number(a.version) - Number(b.version))))
      .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setFailed(true) })
    return () => controller.abort()
  }, [player.playerId])

  if (failed) return <p className="stats-note">Could not load this player's rating history.</p>
  if (!editions) return <p className="stats-note">Loading rating history…</p>
  if (editions.length < 2) return <p className="stats-note">Only one edition on record for this player.</p>

  const width = 640, height = 116, left = 30, right = 14, top = 18, bottom = 22
  const ratings = editions.map(edition => edition.rating)
  const low = Math.floor((Math.min(...ratings) - 3) / 5) * 5, high = Math.ceil((Math.max(...ratings) + 3) / 5) * 5
  const x = (index: number) => left + (editions.length === 1 ? 0 : index / (editions.length - 1)) * (width - left - right)
  const y = (rating: number) => top + (1 - (rating - low) / (high - low)) * (height - top - bottom)
  const points = editions.map((edition, index) => `${x(index)},${y(edition.rating)}`).join(' ')
  const ticks = [low, Math.round((low + high) / 2), high]
  return <svg className="rating-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Rating by edition: ${editions.map(edition => `${versionLabel(edition.version)} ${edition.rating}`).join(', ')}`}>
    {ticks.map(tick => <g key={tick}><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="chart-grid"/><text x={left - 6} y={y(tick) + 3} textAnchor="end" className="chart-axis">{tick}</text></g>)}
    <polyline points={points} className="chart-line"/>
    {editions.map((edition, index) => {
      const current = edition.version === player.version
      return <g key={edition.version}>
        <circle cx={x(index)} cy={y(edition.rating)} r={current ? 5 : 3.5} className={current ? 'chart-dot current' : 'chart-dot'}/>
        <text x={x(index)} y={y(edition.rating) - 9} textAnchor="middle" className={current ? 'chart-value current' : 'chart-value'}>{edition.rating}</text>
        <text x={x(index)} y={height - 6} textAnchor="middle" className="chart-axis">{versionLabel(edition.version).replace(/^(FIFA|FC) /, '')}</text>
      </g>
    })}
  </svg>
}

export function PlayerStatsDialog({ player, onClose }: { player: Player; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => { const dialog = dialogRef.current; if (dialog && !dialog.open) { dialog.showModal(); (document.activeElement as HTMLElement | null)?.blur() } return () => dialog?.close() }, [])
  const profile = player.profile
  const details: [string, string | undefined][] = profile ? [
    ['Age', profile.age === undefined ? undefined : String(profile.age)],
    ['Height', profile.heightCm === undefined ? undefined : `${profile.heightCm} cm`],
    ['Weight', profile.weightKg === undefined ? undefined : `${profile.weightKg} kg`],
    ['Foot', profile.foot],
  ] : []
  const shownDetails = details.filter(([, value]) => value !== undefined)
  const skills: [string, string | undefined][] = profile ? [
    ['Weak foot', profile.weakFoot === undefined ? undefined : stars(profile.weakFoot)],
    ['Skill moves', profile.skillMoves === undefined ? undefined : stars(profile.skillMoves)],
    ['Work rate', profile.workRate],
  ] : []
  const shownSkills = skills.filter(([, value]) => value !== undefined)
  return <dialog className="stats-dialog" ref={dialogRef} onCancel={onClose} onClose={() => { if (!dialogRef.current?.open) onClose() }} onClick={event => { if (event.target === dialogRef.current) onClose() }} aria-labelledby="stats-title">
    <button className="stats-close" onClick={onClose} aria-label="Close player stats"><X size={14}/></button>
    <div className="stats-head">
      <span className="stats-avatar">{initials(player.name)}</span>
      <div>
        <p className="eyebrow">{versionLabel(player.version)}</p>
        <h2 id="stats-title">{player.name}</h2>
        {player.fullName && player.fullName !== player.name && <p className="stats-full">{player.fullName}</p>}
        <p className="stats-meta">{player.club} · {player.nationality}</p>
      </div>
      <div className="stats-overall"><strong>{player.rating}</strong>{player.positions.map(position => <span key={position}>{position}</span>)}</div>
    </div>
    <div className="stats-body">
      {shownDetails.length > 0 && <section><h3>Profile</h3><dl className="stats-facts">{shownDetails.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>}
      {shownSkills.length > 0 && <section><h3>Skill ratings</h3><dl className="stats-facts skills">{shownSkills.map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={value!.includes('★') ? 'stars' : ''}>{value}</dd></div>)}</dl></section>}
      <div className="stats-columns">
        <section><h3>Key stats</h3><StatLines rows={headlineRows(player)}/></section>
        {attributeGroups(player).map(group => <section key={group.title}><h3>{group.title}</h3><StatLines rows={group.rows}/></section>)}
      </div>
      <section><h3>Rating by edition</h3><RatingTimeline player={player}/></section>
    </div>
  </dialog>
}
