import { describe, expect, it } from "vitest";
import type { HistoricalPlayer, MatchConfig, Team } from "@footballsimsim/shared";
import { simulateMatch, validateMatchConfig } from "../src/index.js";

function player(id: string, role: string, overall = 80): HistoricalPlayer {
  const goalkeeper = role === "GK";
  return {
    id, playerId: id, fifaVersion: "20", name: `Player ${id}`, positions: [role], overall,
    attributes: {
      pace: overall, shooting: goalkeeper ? 20 : overall, passing: overall,
      dribbling: overall, defending: overall, physical: overall,
      finishing: overall, vision: overall, composure: overall, reactions: overall,
      interceptions: overall, standingTackle: overall, ballControl: overall,
      agility: overall, acceleration: overall, strength: overall,
      goalkeeperDiving: goalkeeper ? overall : 10,
      goalkeeperHandling: goalkeeper ? overall : 10,
      goalkeeperPositioning: goalkeeper ? overall : 10,
      goalkeeperReflexes: goalkeeper ? overall : 10,
    },
  };
}

function team(id: string, sharedIds = false): Team {
  const prefix = sharedIds ? "shared" : id;
  return {
    id, name: id, formation: "1-2-1",
    lineup: ["GK", "DEF", "DEF", "MID", "FWD"].map((role, index) => ({
      slotId: `${id}-${index}`, role, player: player(`${prefix}-${index}`, role),
    })),
  };
}

const config = (seed: string): MatchConfig => ({
  homeTeam: team("home", true), awayTeam: team("away", true), seed, durationMinutes: 60,
});

describe("simulateMatch", () => {
  it("is fully deterministic for a given seed", () => {
    expect(simulateMatch(config("repeatable"))).toEqual(simulateMatch(config("repeatable")));
  });

  it("supports the same historical players on opposing teams", () => {
    expect(() => validateMatchConfig(config("shared-players"))).not.toThrow();
  });

  it("produces coherent events and aggregate statistics", () => {
    const result = simulateMatch(config("stats"));
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.playerStats).toHaveLength(10);
    expect(result.teamStats.HOME.possession + result.teamStats.AWAY.possession).toBe(100);
    expect(result.finalState.score.home).toBe(result.teamStats.HOME.goals);
    expect(result.finalState.score.away).toBe(result.teamStats.AWAY.goals);
    expect(result.manOfTheMatch.rating).toBeGreaterThanOrEqual(5);
    expect(result.events.every((event) => event.minute <= 60)).toBe(true);
  });

  it("rejects teams that do not have five players", () => {
    const invalid = config("invalid");
    invalid.homeTeam.lineup.pop();
    expect(() => validateMatchConfig(invalid)).toThrow("exactly 5 players");
  });

  it("allows players in roles outside their listed positions", () => {
    const flexible = config("flexible");
    flexible.homeTeam.lineup[1]!.player.positions = ["FWD"];
    expect(() => validateMatchConfig(flexible)).not.toThrow();
  });

  it("never carries an assist across a change of possession", () => {
    for (let seed = 0; seed < 250; seed += 1) {
      const result = simulateMatch(config(`assist-regression-${seed}`));
      for (const [index, event] of result.events.entries()) {
        if (event.type !== "GOAL" || !event.secondaryPlayerId) continue;
        let matchingPassFound = false;
        for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
          const prior = result.events[cursor]!;
          if (prior.team !== event.team) break;
          if (prior.type === "PASS" && prior.successful && prior.playerId === event.secondaryPlayerId) {
            matchingPassFound = true;
            break;
          }
        }
        expect(matchingPassFound, `seed ${seed}, goal ${event.id}`).toBe(true);
      }
    }
  });
});
