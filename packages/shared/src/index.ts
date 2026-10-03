export type TeamSide = "HOME" | "AWAY";

export type MatchEventType =
  | "PASS"
  | "INTERCEPTION"
  | "DRIBBLE"
  | "SHOT"
  | "SAVE"
  | "GOAL";

export type PitchRole = "GK" | "DEF" | "MID" | "FWD" | string;

export interface PlayerAttributes {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
  finishing?: number;
  vision?: number;
  composure?: number;
  reactions?: number;
  interceptions?: number;
  standingTackle?: number;
  ballControl?: number;
  agility?: number;
  acceleration?: number;
  strength?: number;
  goalkeeperDiving?: number;
  goalkeeperHandling?: number;
  goalkeeperPositioning?: number;
  goalkeeperReflexes?: number;
}

export interface HistoricalPlayer {
  id: string;
  playerId: string | number;
  fifaVersion: string;
  fifaUpdate?: string;
  name: string;
  shortName?: string;
  positions: string[];
  overall: number;
  club?: string;
  nationality?: string;
  attributes: PlayerAttributes;
}

export interface LineupSlot {
  slotId: string;
  role: PitchRole;
  player: HistoricalPlayer;
}

export interface Team {
  id: string;
  name: string;
  formation: string;
  lineup: LineupSlot[];
}

export interface MatchConfig {
  homeTeam: Team;
  awayTeam: Team;
  seed: string | number;
  durationMinutes?: number;
}

export interface MatchScore {
  home: number;
  away: number;
}

export interface MatchState {
  minute: number;
  possession: TeamSide;
  score: MatchScore;
}

export interface MatchEvent {
  id: string;
  minute: number;
  type: MatchEventType;
  team: TeamSide;
  playerId: string;
  secondaryPlayerId?: string;
  successful: boolean;
  description: string;
  score: MatchScore;
}

export interface PlayerMatchStats {
  key: string;
  team: TeamSide;
  playerId: string;
  playerName: string;
  passesAttempted: number;
  passesCompleted: number;
  dribblesAttempted: number;
  dribblesCompleted: number;
  interceptions: number;
  shots: number;
  shotsOnTarget: number;
  goals: number;
  assists: number;
  saves: number;
  rating: number;
}

export interface TeamMatchStats {
  possession: number;
  passesAttempted: number;
  passesCompleted: number;
  dribblesAttempted: number;
  dribblesCompleted: number;
  interceptions: number;
  shots: number;
  shotsOnTarget: number;
  goals: number;
  saves: number;
}

export interface ManOfTheMatch {
  playerId: string;
  playerName: string;
  team: TeamSide;
  rating: number;
}

export interface MatchResult {
  seed: string;
  durationMinutes: number;
  finalState: MatchState;
  events: MatchEvent[];
  teamStats: Record<TeamSide, TeamMatchStats>;
  playerStats: PlayerMatchStats[];
  manOfTheMatch: ManOfTheMatch;
}

export const TEAM_SIZE = 5;
