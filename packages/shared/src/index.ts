export type TeamSide = "HOME" | "AWAY";

export type MatchEventType =
  | "PASS"
  | "INTERCEPTION"
  | "DRIBBLE"
  | "SHOT"
  | "SAVE"
  | "GOAL" | "KICKOFF" | "HALF_TIME" | "FULL_TIME" | "ADDED_TIME"
  | "OFFSIDE" | "FOUL" | "ADVANTAGE" | "YELLOW_CARD" | "RED_CARD"
  | "FREE_KICK" | "PENALTY" | "THROW_IN" | "CORNER" | "GOAL_KICK"
  | "BALL_OUT" | "BLOCK" | "MATCH_ABANDONED";

export type PitchRole = "GK" | "DEF" | "MID" | "FWD";

export interface PlayerAttributes {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
  stamina?: number;
  positioning?: number;
  aggression?: number;
  penalties?: number;
  goalkeeperKicking?: number;
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
  snapshot: ReplaySnapshot;
  explanation: string;
  probability?: number;
  expectedGoals?: number;
  offside?: OffsideDecision;
  restart?: RestartType;
}

export type RestartType = "KICKOFF" | "FREE_KICK" | "PENALTY" | "THROW_IN" | "CORNER" | "GOAL_KICK";
export interface OffsideDecision {
  offside: boolean;
  lineX: number;
  ball: PitchPoint;
  receiver: PitchPoint;
  receiverId: string;
  direction: 1 | -1;
}
export interface PitchPoint { x: number; y: number }
export interface ReplayPlayer extends PitchPoint {
  key: string;
  playerId: string;
  team: TeamSide;
  name: string;
  slotId: string;
  energy: number;
  yellowCards: number;
}
export interface TeamProfile {
  attack: number;
  control: number;
  defence: number;
  goalkeeping: number;
}
export interface ReplaySnapshot {
  ball: PitchPoint;
  players: ReplayPlayer[];
  possession: TeamSide;
  phase: "BUILDUP" | "PROGRESSION" | "ATTACK" | "SHOT" | "GOAL" | "RESTART" | "HALF_TIME" | "FULL_TIME";
  period: 1 | 2;
  direction: Record<TeamSide, 1 | -1>;
  status: "PLAY" | "STOPPAGE" | "HALF_TIME" | "FULL_TIME" | "ABANDONED";
  teamStats: Record<TeamSide, TeamMatchStats>;
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
  fouls: number;
  yellowCards: number;
  redCards: number;
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
  expectedGoals: number;
  fouls: number;
  offsides: number;
  corners: number;
  yellowCards: number;
  redCards: number;
  freeKicks: number;
  penalties: number;
}

export interface ManOfTheMatch {
  playerId: string;
  playerName: string;
  team: TeamSide;
  rating: number;
}

export interface MatchResult {
  seed: string;
  regulationMinutes: number;
  halfTimeMinute: number;
  addedTime: { firstHalf: number; secondHalf: number };
  status: "COMPLETED" | "ABANDONED";
  ruleset: "CUSTOM_FIVE_A_SIDE_FOOTBALL";
  durationMinutes: number;
  finalState: MatchState;
  initialSnapshot: ReplaySnapshot;
  teamProfiles: Record<TeamSide, TeamProfile>;
  events: MatchEvent[];
  teamStats: Record<TeamSide, TeamMatchStats>;
  playerStats: PlayerMatchStats[];
  manOfTheMatch: ManOfTheMatch;
}

export const TEAM_SIZE = 5;
