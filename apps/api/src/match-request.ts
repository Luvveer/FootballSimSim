import type { HistoricalPlayer, MatchConfig, PitchRole, Team } from "@footballsimsim/shared";
import { TEAM_SIZE } from "@footballsimsim/shared";
import type { PlayerRecord, PlayerRepository } from "./data/players.js";

interface LineupSelection {
  slotId?: unknown;
  role?: unknown;
  playerId?: unknown;
  fifaVersion?: unknown;
}

interface TeamSelection {
  id?: unknown;
  name?: unknown;
  formation?: unknown;
  lineup?: unknown;
}

interface MatchSelection {
  homeTeam?: unknown;
  awayTeam?: unknown;
  seed?: unknown;
  durationMinutes?: unknown;
}

export class RequestValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super("Invalid match request");
  }
}

function number(record: PlayerRecord, key: string): number {
  const value = Number(record[key]);
  return Number.isFinite(value) ? value : 0;
}

export function toHistoricalPlayer(record: PlayerRecord): HistoricalPlayer {
  return {
    id: `${record.player_id}:${record.fifa_version}`,
    playerId: record.player_id,
    fifaVersion: record.fifa_version,
    fifaUpdate: record.fifa_update,
    name: record.long_name || record.short_name,
    shortName: record.short_name,
    positions: record.player_positions.split(",").map((position) => position.trim()).filter(Boolean),
    overall: number(record, "overall"),
    club: record.club_name || undefined,
    nationality: record.nationality_name || undefined,
    attributes: {
      pace: number(record, "pace"),
      shooting: number(record, "shooting"),
      passing: number(record, "passing"),
      dribbling: number(record, "dribbling"),
      defending: number(record, "defending"),
      physical: number(record, "physic"),
      stamina: number(record, "power_stamina"),
      positioning: number(record, "mentality_positioning"),
      aggression: number(record, "mentality_aggression"),
      penalties: number(record, "mentality_penalties"),
      goalkeeperKicking: number(record, "goalkeeping_kicking"),
      finishing: number(record, "attacking_finishing"),
      vision: number(record, "mentality_vision"),
      composure: number(record, "mentality_composure"),
      reactions: number(record, "movement_reactions"),
      interceptions: number(record, "mentality_interceptions"),
      standingTackle: number(record, "defending_standing_tackle"),
      ballControl: number(record, "skill_ball_control"),
      agility: number(record, "movement_agility"),
      acceleration: number(record, "movement_acceleration"),
      strength: number(record, "power_strength"),
      goalkeeperDiving: number(record, "goalkeeping_diving"),
      goalkeeperHandling: number(record, "goalkeeping_handling"),
      goalkeeperPositioning: number(record, "goalkeeping_positioning"),
      goalkeeperReflexes: number(record, "goalkeeping_reflexes"),
    },
  };
}

function requiredString(value: unknown, path: string, issues: string[]): string {
  if (typeof value !== "string" || value.trim() === "") {
    issues.push(`${path} must be a non-empty string`);
    return "";
  }
  return value.trim();
}

function pitchRole(value: unknown, path: string, issues: string[]): PitchRole {
  const role = requiredString(value, path, issues).toUpperCase();
  if (!(["GK", "DEF", "MID", "FWD"] as const).includes(role as PitchRole)) {
    issues.push(`${path} must be GK, DEF, MID, or FWD`);
  }
  return role as PitchRole;
}

function buildTeam(value: unknown, path: string, repository: PlayerRepository, issues: string[]): Team {
  const team = value && typeof value === "object" ? value as TeamSelection : {};
  const id = requiredString(team.id, `${path}.id`, issues);
  const name = requiredString(team.name, `${path}.name`, issues);
  const formation = requiredString(team.formation, `${path}.formation`, issues);
  if (name.length > 60) issues.push(`${path}.name must be 60 characters or fewer`);
  if (formation && formation !== "1-2-1") issues.push(`${path}.formation must be 1-2-1`);
  const selections = Array.isArray(team.lineup) ? team.lineup as LineupSelection[] : [];
  if (!Array.isArray(team.lineup)) issues.push(`${path}.lineup must be an array`);
  if (selections.length !== TEAM_SIZE) issues.push(`${path}.lineup must contain exactly ${TEAM_SIZE} players`);

  const lineup = selections.map((selection, index) => {
    const prefix = `${path}.lineup[${index}]`;
    const slotId = requiredString(selection?.slotId, `${prefix}.slotId`, issues);
    const role = pitchRole(selection?.role, `${prefix}.role`, issues);
    const playerId = typeof selection?.playerId === "number" ? String(selection.playerId) : requiredString(selection?.playerId, `${prefix}.playerId`, issues);
    const fifaVersion = typeof selection?.fifaVersion === "number" ? String(selection.fifaVersion) : requiredString(selection?.fifaVersion, `${prefix}.fifaVersion`, issues);
    const record = repository.find(playerId, fifaVersion);
    if (!record && playerId && fifaVersion) issues.push(`${prefix} references an unknown player/version`);
    return { slotId, role, player: record ? toHistoricalPlayer(record) : {} as HistoricalPlayer };
  });

  const goalkeepers = lineup.filter((slot) => slot.role.toUpperCase() === "GK").length;
  if (goalkeepers !== 1) issues.push(`${path}.lineup must contain exactly one GK role`);
  const slotIds = lineup.map((slot) => slot.slotId).filter(Boolean);
  if (new Set(slotIds).size !== slotIds.length) issues.push(`${path}.lineup slot IDs must be unique`);

  return { id, name, formation, lineup };
}

export function matchConfigFromRequest(value: unknown, repository: PlayerRepository): MatchConfig {
  const body = value && typeof value === "object" ? value as MatchSelection : {};
  const issues: string[] = [];
  const homeTeam = buildTeam(body.homeTeam, "homeTeam", repository, issues);
  const awayTeam = buildTeam(body.awayTeam, "awayTeam", repository, issues);

  const seed = typeof body.seed === "string" || typeof body.seed === "number" ? body.seed : Date.now();
  const durationMinutes = body.durationMinutes === undefined ? 60 : Number(body.durationMinutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 120) {
    issues.push("durationMinutes must be an integer from 1 to 120");
  }
  if (issues.length > 0) throw new RequestValidationError(issues);
  return { homeTeam, awayTeam, seed, durationMinutes };
}
