import type { MatchEventType, OffsideDecision, ReplaySnapshot, RestartType, TeamProfile } from '@footballsimsim/shared'
export type Player = {
  id: string
  name: string
  fullName?: string
  version: string
  rating: number
  position: string
  club: string
  nationality: string
  pace: number
  shooting: number
  passing: number
  dribbling: number
  defending: number
  physical: number
  gk?: { diving: number; reflexes: number; handling: number; speed: number; kicking: number; positioning: number }
  image?: string
}

export type Side = 'home' | 'away'
export type Slot = string
export type Lineup = Record<Slot, Player | null>

export type MatchEvent = {
  minute: number
  type: Lowercase<MatchEventType> | 'fulltime'
  team: Side
  player: string
  playerId?: string
  assistId?: string
  detail: string
  homeScore?: number
  awayScore?: number
  snapshot?: ReplaySnapshot
  explanation?: string
  successful?: boolean
  expectedGoals?: number
  offside?: OffsideDecision
  restart?: RestartType
}

export type TeamStats = {
  possession: number
  shots: number
  shotsOnTarget: number
  passAccuracy: number
  expectedGoals?: number
  fouls?: number
  offsides?: number
  corners?: number
  yellowCards?: number
  redCards?: number
  freeKicks?: number
  penalties?: number
}

export type MatchResult = {
  durationMinutes?: number
  regulationMinutes?: number
  halfTimeMinute?: number
  addedTime?: { firstHalf: number; secondHalf: number }
  status?: 'COMPLETED' | 'ABANDONED'
  home: { name: string; score: number; stats: TeamStats }
  away: { name: string; score: number; stats: TeamStats }
  events: MatchEvent[]
  initialSnapshot?: ReplaySnapshot
  teamProfiles?: Record<'HOME' | 'AWAY', TeamProfile>
  playerRatings?: { player: string; playerId?: string; team: Side; rating: number; yellowCards?: number; redCards?: number }[]
  manOfTheMatch?: { player: string; playerId?: string; team?: Side; rating: number }
}
