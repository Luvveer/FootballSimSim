import { normalizePositions, type MatchResult as EngineMatchResult, type MatchEventType, type PitchRole, type TeamMatchStats } from '@footballsimsim/shared'
import { apiUrl } from './api-url'
import { FORMATIONS } from './formations'
import type { Lineup, MatchEvent, MatchResult, Player } from './types'

const optionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const mapGk = (raw: Record<string, unknown>): Player['gk'] => {
  const g = (key: string) => optionalNumber(raw[`goalkeeping_${key}`] ?? (raw.gk as Record<string, unknown> | undefined)?.[key])
  const gk = { diving: g('diving'), reflexes: g('reflexes'), handling: g('handling'), speed: g('speed'), kicking: g('kicking'), positioning: g('positioning') }
  return Object.values(gk).some(value => value !== undefined) ? gk : undefined
}

const optionalText = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined

const mapAttributes = (raw: Record<string, unknown>): Player['attributes'] => {
  const attributes = {
    finishing: optionalNumber(raw.attacking_finishing), positioning: optionalNumber(raw.mentality_positioning), penalties: optionalNumber(raw.mentality_penalties),
    ballControl: optionalNumber(raw.skill_ball_control), vision: optionalNumber(raw.mentality_vision), composure: optionalNumber(raw.mentality_composure), reactions: optionalNumber(raw.movement_reactions),
    agility: optionalNumber(raw.movement_agility), stamina: optionalNumber(raw.power_stamina), strength: optionalNumber(raw.power_strength),
    interceptions: optionalNumber(raw.mentality_interceptions), standingTackle: optionalNumber(raw.defending_standing_tackle), aggression: optionalNumber(raw.mentality_aggression),
  }
  return Object.values(attributes).some(value => value !== undefined) ? attributes : undefined
}

const mapProfile = (raw: Record<string, unknown>): Player['profile'] => {
  const profile = {
    age: optionalNumber(raw.age), heightCm: optionalNumber(raw.height_cm), weightKg: optionalNumber(raw.weight_kg), foot: optionalText(raw.preferred_foot),
    jersey: optionalNumber(raw.club_jersey_number), bodyType: optionalText(raw.body_type), weakFoot: optionalNumber(raw.weak_foot), skillMoves: optionalNumber(raw.skill_moves),
    reputation: optionalNumber(raw.international_reputation), workRate: optionalText(raw.work_rate),
  }
  return Object.values(profile).some(value => value !== undefined) ? profile : undefined
}

export const mapPlayer = (raw: Record<string, unknown>, index: number): Player => {
  const sourcePositions = Array.isArray(raw.positions)
    ? raw.positions.map(String)
    : typeof raw.player_roles === 'string'
      ? raw.player_roles.split('|')
      : String(raw.position ?? raw.playerPositions ?? raw.player_positions ?? '')
  const positions = normalizePositions(sourcePositions)
  const position = positions[0]
  if (!position) throw new Error('The player response contains an unsupported position.')
  const playerId = String(raw.playerId ?? raw.player_id ?? raw.id ?? `${raw.name ?? raw.short_name}-${index}`)
  const version = String(raw.version ?? raw.fifaVersion ?? raw.fifa_version ?? 'FIFA')
  return {
    id: `${playerId}:${version}`,
    playerId,
    name: String(raw.name ?? raw.short_name ?? 'Unknown player'),
    fullName: String(raw.fullName ?? raw.longName ?? raw.long_name ?? '') || undefined,
    version,
    rating: Number(raw.rating ?? raw.overall ?? 0),
    position,
    positions,
    club: String(raw.club ?? raw.clubName ?? raw.club_name ?? 'Free agent'),
    nationality: String(raw.nationality ?? raw.nationalityName ?? raw.nationality_name ?? 'Unknown'),
    pace: Number(raw.pace ?? raw.pac ?? (raw.attributes as Record<string,unknown>)?.pace ?? 0),
    shooting: Number(raw.shooting ?? raw.sho ?? (raw.attributes as Record<string,unknown>)?.shooting ?? 0),
    passing: Number(raw.passing ?? raw.pas ?? (raw.attributes as Record<string,unknown>)?.passing ?? 0),
    dribbling: Number(raw.dribbling ?? raw.dri ?? (raw.attributes as Record<string,unknown>)?.dribbling ?? 0),
    defending: Number(raw.defending ?? raw.def ?? (raw.attributes as Record<string,unknown>)?.defending ?? 0),
    physical: Number(raw.physical ?? raw.phy ?? raw.physic ?? (raw.attributes as Record<string,unknown>)?.physical ?? 0), image: typeof raw.image === 'string' ? raw.image : undefined,
    gk: mapGk(raw),
    attributes: mapAttributes(raw),
    profile: mapProfile(raw),
  }
}

export interface PlayerPage {
  players: Player[]
  total: number
  limit: number
  offset: number
}

export async function fetchPlayerVersions(playerId: string, signal?: AbortSignal): Promise<Player[]> {
  const response = await fetch(apiUrl(`/players/${encodeURIComponent(playerId)}/versions`), { signal })
  if (!response.ok) throw new Error('Could not load this player\'s FIFA history.')
  const body = await response.json() as { players?: Record<string, unknown>[] }
  if (!Array.isArray(body.players)) throw new Error('The player history response is invalid.')
  return body.players.map(mapPlayer)
}

export async function fetchVersions(signal?: AbortSignal): Promise<string[]> {
  const response = await fetch(apiUrl('/players/versions'), { signal })
  if (!response.ok) throw new Error('Could not load FIFA versions.')
  const body = await response.json() as { versions?: string[] }
  return Array.isArray(body.versions) ? body.versions : []
}

export async function fetchPlayers(query = '', position: PitchRole | 'ALL' = 'ALL', offset = 0, signal?: AbortSignal, versions: string[] = []): Promise<PlayerPage> {
  const params = new URLSearchParams({ limit: '40', offset: String(offset) })
  if (query.trim()) params.set('q', query.trim())
  if (position !== 'ALL') params.set('position', position)
  if (versions.length) params.set('version', versions.join(','))
  const response = await fetch(apiUrl(`/players?${params}`), { signal })
  if (!response.ok) throw new Error('Could not load players from the API.')
  const body = await response.json() as { players?: Record<string, unknown>[]; total?: number; limit?: number; offset?: number }
  if (!Array.isArray(body.players)) throw new Error('The player response is invalid.')
  return {
    players: body.players.map(mapPlayer),
    total: Number(body.total ?? 0),
    limit: Number(body.limit ?? 40),
    offset: Number(body.offset ?? offset),
  }
}

export const lineupSelections = (lineup: Lineup, formation: string) => FORMATIONS[formation].map(slot => ({
  slotId: slot.id,
  role: slot.role,
  playerId: lineup[slot.id]!.playerId,
  fifaVersion: lineup[slot.id]!.version,
}))

export function mapEngineResult(raw: EngineMatchResult, homeName: string, awayName: string): MatchResult {
  const names = new Map(raw.playerStats.map((player) => [player.playerId, player.playerName]))
  return {
    durationMinutes: raw.durationMinutes, regulationMinutes: raw.regulationMinutes,
    halfTimeMinute: raw.halfTimeMinute, addedTime: raw.addedTime, status: raw.status,
    home: { name: homeName, score: raw.finalState.score.home, stats: normalizeStats(raw.teamStats.HOME) },
    away: { name: awayName, score: raw.finalState.score.away, stats: normalizeStats(raw.teamStats.AWAY) },
    initialSnapshot: raw.initialSnapshot,
    teamProfiles: raw.teamProfiles,
    events: raw.events.map((event) => ({
      minute: event.minute, type: normalizeEventType(event.type), team: event.team === 'AWAY' ? 'away' : 'home',
      player: String(names.get(event.playerId) ?? ''), detail: event.description,
      homeScore: event.score.home, awayScore: event.score.away,
      playerId: event.playerId, assistId: event.secondaryPlayerId, snapshot: event.snapshot, explanation: event.explanation, successful: event.successful, expectedGoals: event.expectedGoals,
      offside: event.offside, restart: event.restart, ballMotion:event.ballMotion,
    })),
    playerRatings: raw.playerStats.map((player) => ({ player:player.playerName, playerId:player.playerId, team:player.team === 'AWAY' ? 'away' : 'home', rating:player.rating, yellowCards:player.yellowCards, redCards:player.redCards })),
    manOfTheMatch: { player:raw.manOfTheMatch.playerName, playerId:raw.manOfTheMatch.playerId, team:raw.manOfTheMatch.team === 'AWAY' ? 'away' : 'home', rating:raw.manOfTheMatch.rating },
  }
}

export async function simulateMatch(homeName: string, awayName: string, home: Lineup, away: Lineup, homeFormation: string, awayFormation: string): Promise<MatchResult> {
  const response = await fetch(apiUrl('/matches/simulate'), {
    method:'POST', headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ seed: Date.now(), durationMinutes:90, homeTeam:{ id:'home', name:homeName, formation:homeFormation, lineup:lineupSelections(home, homeFormation) }, awayTeam:{ id:'away', name:awayName, formation:awayFormation, lineup:lineupSelections(away, awayFormation) } }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { issues?: string[] } | null
    throw new Error(body?.issues?.[0] ?? 'The match simulation failed.')
  }
  return mapEngineResult(await response.json() as EngineMatchResult, homeName, awayName)
}

function normalizeStats(stats: TeamMatchStats) {
  return { expectedGoals: stats.expectedGoals, possession:stats.possession, shots:stats.shots, shotsOnTarget:stats.shotsOnTarget, passAccuracy:stats.passesAttempted ? Math.round(stats.passesCompleted / stats.passesAttempted * 100) : 0,
    fouls:stats.fouls, offsides:stats.offsides, corners:stats.corners, yellowCards:stats.yellowCards, redCards:stats.redCards, freeKicks:stats.freeKicks, penalties:stats.penalties }
}

function normalizeEventType(type: MatchEventType): MatchEvent['type'] {
  return type.toLowerCase() as MatchEvent['type']
}
