export type Player = {
  id: string
  name: string
  version: string
  rating: number
  position: string
  club: string
  nationality: string
  pace: number
  shooting: number
  passing: number
  defending: number
  physical: number
  image?: string
}

export type Side = 'home' | 'away'
export type Slot = 'ST' | 'LM' | 'RM' | 'GK' | 'CAM'
export type Lineup = Record<Slot, Player | null>

export type MatchEvent = {
  minute: number
  type: 'goal' | 'save' | 'shot' | 'card' | 'kickoff' | 'fulltime'
  team: Side
  player: string
  detail: string
  homeScore?: number
  awayScore?: number
}

export type TeamStats = {
  possession: number
  shots: number
  shotsOnTarget: number
  passAccuracy: number
}

export type MatchResult = {
  home: { name: string; score: number; stats: TeamStats }
  away: { name: string; score: number; stats: TeamStats }
  events: MatchEvent[]
  playerRatings?: { player: string; team: Side; rating: number }[]
  manOfTheMatch?: { player: string; rating: number }
}
