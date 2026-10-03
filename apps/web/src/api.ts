import { demoPlayers, demoResult } from './data'
import type { Lineup, MatchResult, Player } from './types'

const mapPlayer = (raw: Record<string, unknown>, index: number): Player => ({
  id: String(raw.id ?? raw.playerId ?? raw.player_id ?? `${raw.name ?? raw.long_name}-${raw.version ?? raw.fifaVersion ?? index}`),
  name: String(raw.name ?? raw.longName ?? raw.long_name ?? raw.short_name ?? 'Unknown player'),
  version: String(raw.version ?? raw.fifaVersion ?? raw.fifa_version ?? 'FIFA'),
  rating: Number(raw.rating ?? raw.overall ?? 0),
  position: String(raw.position ?? (Array.isArray(raw.positions) ? raw.positions[0] : undefined) ?? raw.playerPositions ?? raw.player_positions ?? '—').split(',')[0],
  club: String(raw.club ?? raw.clubName ?? raw.club_name ?? 'Free agent'),
  nationality: String(raw.nationality ?? raw.nationalityName ?? raw.nationality_name ?? 'Unknown'),
  pace: Number(raw.pace ?? raw.pac ?? (raw.attributes as Record<string,unknown>)?.pace ?? 0),
  shooting: Number(raw.shooting ?? raw.sho ?? (raw.attributes as Record<string,unknown>)?.shooting ?? 0),
  passing: Number(raw.passing ?? raw.pas ?? (raw.attributes as Record<string,unknown>)?.passing ?? 0),
  defending: Number(raw.defending ?? raw.def ?? (raw.attributes as Record<string,unknown>)?.defending ?? 0),
  physical: Number(raw.physical ?? raw.phy ?? raw.physic ?? (raw.attributes as Record<string,unknown>)?.physical ?? 0), image: typeof raw.image === 'string' ? raw.image : undefined,
})

export async function fetchPlayers(): Promise<Player[]> {
  try {
    const response = await fetch('/api/players')
    if (!response.ok) throw new Error('Player service unavailable')
    const body = await response.json()
    const rows = Array.isArray(body) ? body : body.players
    if (!Array.isArray(rows) || rows.length < 10) throw new Error('Not enough player data')
    return rows.map(mapPlayer)
  } catch { return demoPlayers }
}

const selected = (lineup: Lineup) => Object.entries(lineup).map(([slotId, player]) => ({
  slotId,
  role: slotId === 'GK' ? 'GK' : slotId === 'ST' ? 'FWD' : 'MID',
  playerId: player!.id,
  fifaVersion: player!.version,
}))

export async function simulateMatch(homeName: string, awayName: string, home: Lineup, away: Lineup): Promise<MatchResult> {
  try {
    const response = await fetch('/api/matches/simulate', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ seed: Date.now(), durationMinutes:90, homeTeam:{ id:'home', name:homeName, formation:'1-2-1', lineup:selected(home) }, awayTeam:{ id:'away', name:awayName, formation:'1-2-1', lineup:selected(away) } }),
    })
    if (!response.ok) throw new Error('Simulation unavailable')
    const raw = await response.json() as Record<string, any>
    if (!raw.finalState || !raw.teamStats) return raw as MatchResult
    const names = new Map((raw.playerStats ?? []).map((player: any) => [player.playerId, player.playerName]))
    return {
      home: { name: homeName, score: raw.finalState.score.home, stats: normalizeStats(raw.teamStats.HOME) },
      away: { name: awayName, score: raw.finalState.score.away, stats: normalizeStats(raw.teamStats.AWAY) },
      events: (raw.events ?? []).map((event: any) => ({
        minute: Math.round(event.minute), type: normalizeEventType(event.type), team: event.team === 'AWAY' ? 'away' : 'home',
        player: String(names.get(event.playerId) ?? ''), detail: event.description,
        homeScore: event.score?.home, awayScore: event.score?.away,
      })),
      playerRatings: (raw.playerStats ?? []).map((player: any) => ({ player:player.playerName, team:player.team === 'AWAY' ? 'away' : 'home', rating:player.rating })),
      manOfTheMatch: { player:raw.manOfTheMatch.playerName, rating:raw.manOfTheMatch.rating },
    }
  } catch { return demoResult(homeName, awayName) }
}

function normalizeStats(stats: Record<string,number>) {
  return { possession:stats.possession, shots:stats.shots, shotsOnTarget:stats.shotsOnTarget, passAccuracy:stats.passesAttempted ? Math.round(stats.passesCompleted / stats.passesAttempted * 100) : 0 }
}

function normalizeEventType(type: string): 'goal'|'save'|'shot'|'card'|'kickoff'|'fulltime' {
  const normalized = type.toLowerCase()
  return normalized === 'goal' || normalized === 'save' || normalized === 'shot' ? normalized : 'shot'
}
