import type {
  HistoricalPlayer,
  LineupSlot,
  MatchConfig,
  MatchEvent,
  MatchEventType,
  MatchResult,
  PlayerMatchStats,
  Team,
  TeamMatchStats,
  TeamSide,
} from "@footballsimsim/shared";
import { TEAM_SIZE } from "@footballsimsim/shared";
import { seededRandom } from "./random.js";

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const average = (...values: Array<number | undefined>) => {
  const present = values.filter((value): value is number => value !== undefined);
  return present.length ? present.reduce((total, value) => total + value, 0) / present.length : 50;
};

const chance = (attack: number, defence: number, floor = 0.12, ceiling = 0.9) =>
  floor + (ceiling - floor) / (1 + Math.exp(-(attack - defence) / 13));

export function validateMatchConfig(config: MatchConfig): void {
  for (const [label, team] of [["home", config.homeTeam], ["away", config.awayTeam]] as const) {
    if (team.lineup.length !== TEAM_SIZE) {
      throw new Error(`${label} team must contain exactly ${TEAM_SIZE} players`);
    }
    if (team.lineup.filter((slot) => slot.role.toUpperCase() === "GK").length !== 1) {
      throw new Error(`${label} team must assign exactly one player to goalkeeper`);
    }
    const ids = team.lineup.map((slot) => slot.player.id);
    if (new Set(ids).size !== ids.length) {
      throw new Error(`${label} team cannot select the same historical player twice`);
    }
  }
  const duration = config.durationMinutes ?? 90;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("match duration must be positive");
}

const blankTeamStats = (): TeamMatchStats => ({
  possession: 0,
  passesAttempted: 0,
  passesCompleted: 0,
  dribblesAttempted: 0,
  dribblesCompleted: 0,
  interceptions: 0,
  shots: 0,
  shotsOnTarget: 0,
  goals: 0,
  saves: 0,
});

const playerKey = (side: TeamSide, player: HistoricalPlayer) => `${side}:${player.id}`;

function blankPlayerStats(side: TeamSide, player: HistoricalPlayer): PlayerMatchStats {
  return {
    key: playerKey(side, player), team: side, playerId: player.id, playerName: player.name,
    passesAttempted: 0, passesCompleted: 0, dribblesAttempted: 0, dribblesCompleted: 0,
    interceptions: 0, shots: 0, shotsOnTarget: 0, goals: 0, assists: 0, saves: 0, rating: 6,
  };
}

const opponent = (side: TeamSide): TeamSide => side === "HOME" ? "AWAY" : "HOME";

function select<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!;
}

function outfield(team: Team): LineupSlot[] {
  const players = team.lineup.filter((slot) => slot.role.toUpperCase() !== "GK");
  return players.length ? players : team.lineup;
}

function keeper(team: Team): LineupSlot {
  return team.lineup.find((slot) => slot.role.toUpperCase() === "GK")!;
}

function eventDescription(type: MatchEventType, actor: string, other?: string): string {
  switch (type) {
    case "PASS": return `${actor} ${other ? `finds ${other}` : "misplaces the pass"}.`;
    case "INTERCEPTION": return `${actor} reads the pass and wins the ball.`;
    case "DRIBBLE": return `${actor} ${other ? `gets past ${other}` : "is stopped"}.`;
    case "SHOT": return `${actor} shoots.`;
    case "SAVE": return `${actor} makes the save.`;
    case "GOAL": return `${actor} scores!`;
  }
}

export function simulateMatch(config: MatchConfig): MatchResult {
  validateMatchConfig(config);
  const duration = config.durationMinutes ?? 90;
  const seed = String(config.seed);
  const random = seededRandom(seed);
  const teams: Record<TeamSide, Team> = { HOME: config.homeTeam, AWAY: config.awayTeam };
  const teamStats: Record<TeamSide, TeamMatchStats> = { HOME: blankTeamStats(), AWAY: blankTeamStats() };
  const stats = new Map<string, PlayerMatchStats>();
  for (const side of ["HOME", "AWAY"] as const) {
    for (const slot of teams[side].lineup) stats.set(playerKey(side, slot.player), blankPlayerStats(side, slot.player));
  }

  const events: MatchEvent[] = [];
  const score = { home: 0, away: 0 };
  const possessionTicks: Record<TeamSide, number> = { HOME: 0, AWAY: 0 };
  const lastPasser: Partial<Record<TeamSide, string>> = {};
  let side: TeamSide = random() < 0.5 ? "HOME" : "AWAY";
  let minute = 0;
  let eventNumber = 0;

  const emit = (type: MatchEventType, eventSide: TeamSide, actor: LineupSlot, successful: boolean, secondary?: LineupSlot) => {
    events.push({
      id: `event-${++eventNumber}`, minute: Math.min(duration, Math.round(minute * 10) / 10), type,
      team: eventSide, playerId: actor.player.id, secondaryPlayerId: secondary?.player.id,
      successful, description: eventDescription(type, actor.player.name, successful ? secondary?.player.name : undefined),
      score: { ...score },
    });
  };

  while (minute < duration) {
    minute += 0.8 + random() * 2.1;
    if (minute > duration) break;
    possessionTicks[side] += 1;
    const attacking = teams[side];
    const actingSide = side;
    const defendingSide = opponent(side);
    const defending = teams[defendingSide];
    const actor = select(outfield(attacking), random);
    const defender = select(outfield(defending), random);
    const actorStats = stats.get(playerKey(side, actor.player))!;
    const defenderStats = stats.get(playerKey(defendingSide, defender.player))!;
    const roll = random();

    if (roll < 0.55) {
      const receiver = select(outfield(attacking).filter((slot) => slot.slotId !== actor.slotId).length
        ? outfield(attacking).filter((slot) => slot.slotId !== actor.slotId) : outfield(attacking), random);
      const passSkill = average(actor.player.attributes.passing, actor.player.attributes.vision, actor.player.attributes.composure);
      const defenceSkill = average(defender.player.attributes.defending, defender.player.attributes.interceptions, defender.player.attributes.reactions);
      const success = random() < chance(passSkill, defenceSkill, 0.35, 0.94);
      actorStats.passesAttempted += 1;
      teamStats[side].passesAttempted += 1;
      if (success) {
        actorStats.passesCompleted += 1;
        teamStats[side].passesCompleted += 1;
        lastPasser[side] = actor.player.id;
        emit("PASS", side, actor, true, receiver);
      } else {
        emit("PASS", side, actor, false);
        defenderStats.interceptions += 1;
        teamStats[defendingSide].interceptions += 1;
        emit("INTERCEPTION", defendingSide, defender, true, actor);
        side = defendingSide;
        lastPasser[side] = undefined;
      }
    } else if (roll < 0.78) {
      const attackSkill = average(actor.player.attributes.dribbling, actor.player.attributes.ballControl, actor.player.attributes.agility, actor.player.attributes.pace);
      const defenceSkill = average(defender.player.attributes.defending, defender.player.attributes.standingTackle, defender.player.attributes.strength);
      const success = random() < chance(attackSkill, defenceSkill, 0.2, 0.86);
      actorStats.dribblesAttempted += 1;
      teamStats[side].dribblesAttempted += 1;
      if (success) {
        actorStats.dribblesCompleted += 1;
        teamStats[side].dribblesCompleted += 1;
      } else {
        side = defendingSide;
        lastPasser[side] = undefined;
      }
      emit("DRIBBLE", actingSide, actor, success, defender);
    } else {
      const shooting = average(actor.player.attributes.shooting, actor.player.attributes.finishing, actor.player.attributes.composure);
      const onTarget = random() < clamp(0.3 + (shooting - 50) / 125, 0.2, 0.8);
      actorStats.shots += 1;
      teamStats[side].shots += 1;
      if (onTarget) {
        actorStats.shotsOnTarget += 1;
        teamStats[side].shotsOnTarget += 1;
      }
      emit("SHOT", side, actor, onTarget);
      if (onTarget) {
        const goalie = keeper(defending);
        const goalieStats = stats.get(playerKey(defendingSide, goalie.player))!;
        const keeping = average(goalie.player.attributes.goalkeeperDiving, goalie.player.attributes.goalkeeperHandling,
          goalie.player.attributes.goalkeeperPositioning, goalie.player.attributes.goalkeeperReflexes);
        if (random() < chance(keeping, shooting, 0.3, 0.82)) {
          goalieStats.saves += 1;
          teamStats[defendingSide].saves += 1;
          emit("SAVE", defendingSide, goalie, true, actor);
          side = defendingSide;
        } else {
          actorStats.goals += 1;
          teamStats[side].goals += 1;
          if (side === "HOME") score.home += 1; else score.away += 1;
          const assisterId = lastPasser[side];
          if (assisterId && assisterId !== actor.player.id) stats.get(`${side}:${assisterId}`)!.assists += 1;
          emit("GOAL", side, actor, true);
          side = defendingSide;
        }
        lastPasser[side] = undefined;
      } else if (random() < 0.65) {
        side = defendingSide;
        lastPasser[side] = undefined;
      }
    }
  }

  const totalTicks = possessionTicks.HOME + possessionTicks.AWAY || 1;
  teamStats.HOME.possession = Math.round((possessionTicks.HOME / totalTicks) * 100);
  teamStats.AWAY.possession = 100 - teamStats.HOME.possession;

  const playerStats = [...stats.values()].map((player) => ({
    ...player,
    rating: clamp(Math.round((6 + player.goals * 1.3 + player.assists * 0.7 + player.saves * 0.12 +
      player.interceptions * 0.1 + player.passesCompleted * 0.015 + player.dribblesCompleted * 0.04 -
      (player.shots - player.shotsOnTarget) * 0.08) * 10) / 10, 5, 10),
  }));
  playerStats.sort((left, right) => right.rating - left.rating || right.goals - left.goals || left.key.localeCompare(right.key));
  const best = playerStats[0]!;

  return {
    seed, durationMinutes: duration,
    finalState: { minute: duration, possession: side, score: { ...score } },
    events, teamStats, playerStats,
    manOfTheMatch: { playerId: best.playerId, playerName: best.playerName, team: best.team, rating: best.rating },
  };
}

export type { MatchConfig, MatchResult } from "@footballsimsim/shared";
