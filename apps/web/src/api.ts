import type { MatchResult as EngineMatchResult, MatchEventType, TeamMatchStats } from '@footballsimsim/shared'
import type { Lineup, MatchEvent, MatchResult, Player } from './types'

const mapPlayer = (raw: Record<string, unknown>, index: number): Player => ({
  id: String(raw.id ?? raw.playerId ?? raw.player_id ?? `${raw.name ?? raw.short_name}-${raw.version ?? raw.fifaVersion ?? index}`),
  name: String(raw.name ?? raw.short_name ?? 'Unknown player'),
  fullName: String(raw.fullName ?? raw.longName ?? raw.long_name ?? '') || undefined,
  version: String(raw.version ?? raw.fifaVersion ?? raw.fifa_version ?? 'FIFA'),
  rating: Number(raw.rating ?? raw.overall ?? 0),
  position: String(raw.position ?? (Array.isArray(raw.positions) ? raw.positions[0] : undefined) ?? raw.playerPositions ?? raw.player_positions ?? '—').split(',')[0],
  club: String(raw.club ?? raw.clubName ?? raw.club_name ?? 'Free agent'),
  nationality: String(raw.nationality ?? raw.nationalityName ?? raw.nationality_name ?? 'Unknown'),
  pace: Number(raw.pace ?? raw.pac ?? (raw.attributes as Record<string,unknown>)?.pace ?? 0),
  shooting: Number(raw.shooting ?? raw.sho ?? (raw.attributes as Record<string,unknown>)?.shooting ?? 0),
  passing: Number(raw.passing ?? raw.pas ?? (raw.attributes as Record<string,unknown>)?.passing ?? 0),
  dribbling: Number(raw.dribbling ?? raw.dri ?? (raw.attributes as Record<string,unknown>)?.dribbling ?? 0),
  defending: Number(raw.defending ?? raw.def ?? (raw.attributes as Record<string,unknown>)?.defending ?? 0),
  physical: Number(raw.physical ?? raw.phy ?? raw.physic ?? (raw.attributes as Record<string,unknown>)?.physical ?? 0), image: typeof raw.image === 'string' ? raw.image : undefined,
})

export interface PlayerPage {
  players: Player[]
  total: number
  limit: number
  offset: number
}

export async function fetchPlayerVersions(playerId: string, signal?: AbortSignal): Promise<Player[]> {
  const response = await fetch(`/api/players/${encodeURIComponent(playerId)}/versions`, { signal })
  if (!response.ok) throw new Error('Could not load this player\'s FIFA history.')
  const body = await response.json() as { players?: Record<string, unknown>[] }
  if (!Array.isArray(body.players)) throw new Error('The player history response is invalid.')
  return body.players.map(mapPlayer)
}

export async function fetchPlayers(query = '', position = 'ALL', offset = 0, signal?: AbortSignal): Promise<PlayerPage> {
  const params = new URLSearchParams({ limit: '40', offset: String(offset) })
  if (query.trim()) params.set('q', query.trim())
  if (position !== 'ALL') params.set('position', position)
  const response = await fetch(`/api/players?${params}`, { signal })
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

const selected = (lineup: Lineup) => Object.entries(lineup).map(([slotId, player]) => ({
  slotId,
  role: slotId === 'GK' ? 'GK' : slotId === 'ST' ? 'FWD' : 'MID',
  playerId: player!.id,
  fifaVersion: player!.version,
}))

export async function simulateMatch(homeName: string, awayName: string, home: Lineup, away: Lineup): Promise<MatchResult> {
  const response = await fetch('/api/matches/simulate', {
    method:'POST', headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({ seed: Date.now(), durationMinutes:90, homeTeam:{ id:'home', name:homeName, formation:'1-2-1', lineup:selected(home) }, awayTeam:{ id:'away', name:awayName, formation:'1-2-1', lineup:selected(away) } }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { issues?: string[] } | null
    throw new Error(body?.issues?.[0] ?? 'The match simulation failed.')
  }
  const raw = await response.json() as EngineMatchResult
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
      playerId: event.playerId, snapshot: event.snapshot, explanation: event.explanation, successful: event.successful, expectedGoals: event.expectedGoals,
      offside: event.offside, restart: event.restart,
    })),
    playerRatings: raw.playerStats.map((player) => ({ player:player.playerName, playerId:player.playerId, team:player.team === 'AWAY' ? 'away' : 'home', rating:player.rating, yellowCards:player.yellowCards, redCards:player.redCards })),
    manOfTheMatch: { player:raw.manOfTheMatch.playerName, playerId:raw.manOfTheMatch.playerId, team:raw.manOfTheMatch.team === 'AWAY' ? 'away' : 'home', rating:raw.manOfTheMatch.rating },
  }
}

function normalizeStats(stats: TeamMatchStats) {
  return { expectedGoals: stats.expectedGoals, possession:stats.possession, shots:stats.shots, shotsOnTarget:stats.shotsOnTarget, passAccuracy:stats.passesAttempted ? Math.round(stats.passesCompleted / stats.passesAttempted * 100) : 0,
    fouls:stats.fouls, offsides:stats.offsides, corners:stats.corners, yellowCards:stats.yellowCards, redCards:stats.redCards, freeKicks:stats.freeKicks, penalties:stats.penalties }
}

function normalizeEventType(type: MatchEventType): MatchEvent['type'] {
  return type.toLowerCase() as MatchEvent['type']
}
