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

describe("football match lifecycle", () => {
  it("records shot release geometry without replacing the resolved snapshot", () => {
    const result = simulateMatch(config("shot-animation"));
    const shots = result.events.filter(event => event.type === "SHOT");
    expect(shots.length).toBeGreaterThan(0);
    for (const shot of shots) {
      expect(shot.ballMotion?.kind).toBe("SHOT");
      expect(shot.ballMotion?.to).toEqual(shot.snapshot.ball);
      expect(shot.ballMotion?.to).not.toBe(shot.snapshot.ball);
      expect(shot.ballMotion?.from.x).toBeGreaterThanOrEqual(0);
      expect(shot.ballMotion?.from.x).toBeLessThanOrEqual(100);
      expect(shot.ballMotion?.from.y).toBeGreaterThanOrEqual(0);
      expect(shot.ballMotion?.from.y).toBeLessThanOrEqual(100);
    }
  });
  it("places on-target shots inside the posts and carries the target through goals", () => {
    const targets: number[] = [];
    for (let seed = 0; seed < 10; seed++) {
      const result = simulateMatch(config(`shot-placement-${seed}`));
      result.events.forEach((event, index) => {
        if (event.type !== "SHOT" || !event.successful) return;
        const target = event.ballMotion!.to;
        expect(target.y).toBeGreaterThanOrEqual(42);
        expect(target.y).toBeLessThanOrEqual(58);
        targets.push(target.y);
        if (result.events[index + 1]?.type === "GOAL") expect(result.events[index + 1]!.snapshot.ball.y).toBe(target.y);
      });
    }
    expect(targets.some(y => y < 48)).toBe(true);
    expect(targets.some(y => y > 52)).toBe(true);
    expect(targets.some(y => Math.abs(y - 50) < 1)).toBe(true);
  });
  it("plays two halves with opposite kickoff teams, switched ends and added time", () => {
    const result = simulateMatch(config("rules-halves"));
    const half = result.events.find(e=>e.type==="HALF_TIME")!;
    const index = result.events.indexOf(half);
    const opening = result.events[0]!;
    const second = result.events[index+1]!;
    expect(opening.type).toBe("KICKOFF");
    expect(second.type).toBe("KICKOFF");
    expect(second.team).not.toBe(opening.team);
    expect(half.minute).toBe(result.halfTimeMinute);
    expect(half.snapshot.status).toBe("HALF_TIME");
    expect(opening.snapshot.direction.HOME).toBe(1);
    expect(second.snapshot.direction.HOME).toBe(-1);
    expect(second.snapshot.period).toBe(2);
    expect(result.events.at(-1)!.type).toBe("FULL_TIME");
    // The whistle waits for the ball to leave the end quarters, so play can run a little past the announced added time.
    const announced = 60 + result.addedTime.firstHalf + result.addedTime.secondHalf;
    expect(result.durationMinutes).toBeGreaterThanOrEqual(announced);
    expect(result.durationMinutes).toBeLessThanOrEqual(announced + 10);
  });

  it("awards defending indirect free kicks for offside and tracks discipline without retaining sent-off players", () => {
    let offsides = 0, reds = 0, penalties = 0, corners = 0;
    for (let seed=0;seed<150;seed++) {
      const result=simulateMatch(config(`rule-lifecycle-${seed}`));
      const dismissed = new Set<string>();
      for (const [index,event] of result.events.entries()) {
        if (event.type==="OFFSIDE") {
          offsides++;
          expect(event.offside?.offside).toBe(true);
          const next=result.events[index+1];
          if (next?.type==="FREE_KICK") {
            expect(next.team).not.toBe(event.team);
            expect(next.explanation).toContain("Indirect");
            const nextPlay=result.events.slice(index+2).find(e=>["PASS","SHOT","HALF_TIME","FULL_TIME"].includes(e.type));
            expect(nextPlay?.type).not.toBe("SHOT");
          }
        }
        if (event.type==="RED_CARD") { reds++; dismissed.add(`${event.team}:${event.playerId}`); }
        for (const p of event.snapshot.players) expect(dismissed.has(p.key)).toBe(false);
        if (event.type==="PENALTY") {
          penalties++;
          expect(event.snapshot.ball.y).toBe(50);
          expect(event.snapshot.ball.x).toBe(event.snapshot.direction[event.team]===1?89:11);
          expect(result.events[index+1]?.type).toBe("SHOT");
        }
        if(event.type==="CORNER") corners++;
      }
      for (const side of ["HOME","AWAY"] as const) {
        for (const [type,key] of [["FOUL","fouls"],["OFFSIDE","offsides"],["CORNER","corners"],["YELLOW_CARD","yellowCards"],["RED_CARD","redCards"]] as const) {
          // A corner awarded at the whistle may remain untaken.
          const count=result.events.filter(e=>e.team===side&&e.type===type).length;
          if(type==="CORNER") expect(result.teamStats[side][key]).toBeGreaterThanOrEqual(count);
          else expect(result.teamStats[side][key]).toBe(count);
        }
      }
    }
    expect(offsides).toBeGreaterThan(0); expect(reds).toBeGreaterThan(0);
    expect(penalties).toBeGreaterThan(0); expect(corners).toBeGreaterThan(0);
  });
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
    expect(result.regulationMinutes).toBe(60);
    // The whistle waits for the ball to leave the end quarters, so play can run a little past the announced added time.
    const announced = 60 + result.addedTime.firstHalf + result.addedTime.secondHalf;
    expect(result.durationMinutes).toBeGreaterThanOrEqual(announced);
    expect(result.durationMinutes).toBeLessThanOrEqual(announced + 10);
    expect(result.events.every((event) => event.minute <= result.durationMinutes)).toBe(true);
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
          if (prior.snapshot.possession !== event.team || ["GOAL", "KICKOFF", "FREE_KICK", "PENALTY", "CORNER", "THROW_IN", "GOAL_KICK"].includes(prior.type)) break;
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


describe("attribute-driven match model", () => {
  function ratedTeam(id: string, rating: number): Team {
    const result = team(id);
    result.lineup = result.lineup.map(slot => ({ ...slot, player: player(slot.player.id, slot.role, rating) }));
    return result;
  }

  it("gives stronger lineups more goals, shots, possession and completed passes over many seeds", () => {
    const homeTeam = ratedTeam("strong", 85);
    const awayTeam = ratedTeam("weak", 65);
    const totals = { homeGoals: 0, awayGoals: 0, homeShots: 0, awayShots: 0, possession: 0, homePasses: 0, awayPasses: 0 };
    for (let seed = 0; seed < 150; seed++) {
      const result = simulateMatch({ homeTeam, awayTeam, seed, durationMinutes: 90 });
      totals.homeGoals += result.teamStats.HOME.goals;
      totals.awayGoals += result.teamStats.AWAY.goals;
      totals.homeShots += result.teamStats.HOME.shots;
      totals.awayShots += result.teamStats.AWAY.shots;
      totals.possession += result.teamStats.HOME.possession;
      totals.homePasses += result.teamStats.HOME.passesCompleted;
      totals.awayPasses += result.teamStats.AWAY.passesCompleted;
    }
    expect(totals.homeGoals).toBeGreaterThan(totals.awayGoals * 2);
    expect(totals.homeShots).toBeGreaterThan(totals.awayShots * 1.5);
    expect(totals.possession / 150).toBeGreaterThan(50);
    expect(totals.homePasses).toBeGreaterThan(totals.awayPasses);
  });

  it("does not systematically favor either side with equal attributes", () => {
    let possession = 0, homeGoals = 0, awayGoals = 0;
    for (let seed = 0; seed < 200; seed++) {
      const result = simulateMatch({ homeTeam: ratedTeam("home", 80), awayTeam: ratedTeam("away", 80), seed, durationMinutes: 90 });
      possession += result.teamStats.HOME.possession;
      homeGoals += result.teamStats.HOME.goals;
      awayGoals += result.teamStats.AWAY.goals;
    }
    expect(possession / 200).toBeGreaterThan(47);
    expect(possession / 200).toBeLessThan(53);
    expect(homeGoals / awayGoals).toBeGreaterThan(0.8);
    expect(homeGoals / awayGoals).toBeLessThan(1.25);
  });

  it("changes outcomes when detailed attributes change while overall stays fixed", () => {
    const strongKeeper = ratedTeam("away", 80);
    const weakKeeper = structuredClone(strongKeeper);
    for (const key of ["goalkeeperDiving", "goalkeeperHandling", "goalkeeperPositioning", "goalkeeperReflexes"] as const) {
      strongKeeper.lineup[0]!.player.attributes[key] = 95;
      weakKeeper.lineup[0]!.player.attributes[key] = 25;
    }
    let strongConceded = 0, weakConceded = 0;
    for (let seed = 0; seed < 120; seed++) {
      const homeTeam = ratedTeam("home", 80);
      strongConceded += simulateMatch({ homeTeam, awayTeam: strongKeeper, seed }).finalState.score.home;
      weakConceded += simulateMatch({ homeTeam, awayTeam: weakKeeper, seed }).finalState.score.home;
    }
    expect(weakConceded).toBeGreaterThan(strongConceded * 1.5);
  });

  it("uses broad-attribute fallbacks when optional composure is missing", () => {
    const explicit = config("missing-composure-fallback");
    for (const side of [explicit.homeTeam, explicit.awayTeam]) {
      for (const slot of side.lineup) {
        slot.player.attributes.shooting = 80;
        slot.player.attributes.positioning = 80;
        slot.player.attributes.composure = 80;
      }
    }
    const missing = structuredClone(explicit);
    for (const side of [missing.homeTeam, missing.awayTeam]) {
      for (const slot of side.lineup) delete slot.player.attributes.composure;
    }

    expect(simulateMatch(missing)).toEqual(simulateMatch(explicit));
  });

  it("retains the receiving player as the next ball carrier and prevents shots during early buildup", () => {
    const result = simulateMatch(config("carrier-continuity"));
    for (const [index, event] of result.events.entries()) {
      const next = result.events[index + 1];
      if (event.type === "PASS" && event.successful && next && ["PASS", "DRIBBLE", "SHOT"].includes(next.type)) {
        expect(next.team).toBe(event.team);
        expect(next.playerId).toBe(event.secondaryPlayerId);
      }
      if (event.type === "SHOT") {
        const prior = result.events[index - 1]?.snapshot ?? result.initialSnapshot;
        expect(prior.phase).not.toBe("BUILDUP");
      }
    }
  });

  it("keeps replay snapshots, xG and score consistent with final statistics", () => {
    const result = simulateMatch(config("replay-telemetry"));
    expect(result.initialSnapshot.players).toHaveLength(10);
    expect(result.initialSnapshot.teamStats.HOME.shots).toBe(0);
    for (const event of result.events) {
      const dismissed = result.events.slice(0, result.events.indexOf(event)+1).filter(e => e.type === "RED_CARD");
      expect(event.snapshot.players).toHaveLength(10-dismissed.length);
      expect(new Set(event.snapshot.players.map(p => p.key)).size).toBe(event.snapshot.players.length);
      for (const red of dismissed) expect(event.snapshot.players.some(p => p.playerId===red.playerId && p.team===red.team)).toBe(false);
      expect(event.snapshot.teamStats.HOME.possession + event.snapshot.teamStats.AWAY.possession).toBe(100);
      expect(event.snapshot.teamStats.HOME.goals).toBe(event.score.home);
      expect(event.snapshot.teamStats.AWAY.goals).toBe(event.score.away);
      if (event.snapshot.carrierKey) expect(event.snapshot.carrierKey).toMatch(new RegExp(`^${event.snapshot.possession}:`));
      for (const point of [event.snapshot.ball, ...event.snapshot.players]) {
        expect(point.x).toBeGreaterThanOrEqual(0); expect(point.x).toBeLessThanOrEqual(100);
        expect(point.y).toBeGreaterThanOrEqual(0); expect(point.y).toBeLessThanOrEqual(100);
      }
    }
    for (const side of ["HOME", "AWAY"] as const) {
      const shots = result.events.filter(e => e.team === side && e.type === "SHOT");
      expect(shots.reduce((sum, e) => sum + (e.expectedGoals ?? 0), 0)).toBeCloseTo(result.teamStats[side].expectedGoals, 3);
      expect(shots.length).toBe(result.teamStats[side].shots);
      expect(result.events.at(-1)!.snapshot.teamStats[side].shots).toBe(result.teamStats[side].shots);
    }
    const saves = result.events.filter(event => event.type === "SAVE");
    expect(saves.length).toBeGreaterThan(0);
    for (const save of saves) expect(save.snapshot.carrierKey).toBe(`${save.team}:${save.playerId}`);
  });
});


it("uses forward roles and stamina instead of selecting all actors uniformly", () => {
  let forwardShots = 0, defenderShots = 0;
  for (let seed = 0; seed < 100; seed++) {
    const match = simulateMatch(config(`roles-${seed}`));
    for (const event of match.events.filter(e => e.type === "SHOT" && e.team === "HOME")) {
      const slot = config("unused").homeTeam.lineup.find(s => s.player.id === event.playerId)!;
      if (slot.role === "FWD") forwardShots++;
      if (slot.role === "DEF") defenderShots++;
    }
  }
  // Two defenders vs one forward: the forward should still take more shots.
  expect(forwardShots).toBeGreaterThan(defenderShots);
  const fit = config("fitness");
  fit.homeTeam.lineup[3]!.player.attributes.stamina = 95;
  fit.awayTeam.lineup[3]!.player.attributes.stamina = 20;
  const result = simulateMatch(fit);
  const players = result.events.at(-1)!.snapshot.players;
  const home = players.find(p => p.key === `HOME:${fit.homeTeam.lineup[3]!.player.id}`)!;
  const away = players.find(p => p.key === `AWAY:${fit.awayTeam.lineup[3]!.player.id}`)!;
  expect(home.energy).toBeGreaterThan(away.energy);
});

it("waits for the ball to leave the end quarters before the whistle, for at most 5 minutes", () => {
  for (let n = 0; n < 40; n++) {
    const result = simulateMatch(config(`whistle-${n}`));
    for (const event of result.events.filter(e => e.type === "HALF_TIME" || e.type === "FULL_TIME")) {
      const planned = event.type === "HALF_TIME" ? 30 + result.addedTime.firstHalf : result.halfTimeMinute + 30 + result.addedTime.secondHalf;
      const delay = event.minute - planned;
      expect(delay).toBeLessThanOrEqual(5.01);
      // Inside the 5 minute allowance the whistle only blows with the ball in the middle half.
      if (delay < 4.99) {
        expect(event.snapshot.ball.x).toBeGreaterThanOrEqual(25);
        expect(event.snapshot.ball.x).toBeLessThanOrEqual(75);
      }
    }
  }
});
