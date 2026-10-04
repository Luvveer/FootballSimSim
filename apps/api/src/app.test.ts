import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";

const csvPath = fileURLToPath(new URL("../test/players.csv", import.meta.url));

const lineup = [
  { slotId: "GK", role: "GK", playerId: "1", fifaVersion: "20" },
  { slotId: "DEF", role: "DEF", playerId: "2", fifaVersion: "20" },
  { slotId: "MID", role: "MID", playerId: "3", fifaVersion: "20" },
  { slotId: "WING", role: "MID", playerId: "4", fifaVersion: "20" },
  { slotId: "FWD", role: "FWD", playerId: "5", fifaVersion: "20" },
];

const matchBody = {
  seed: "route-test",
  durationMinutes: 90,
  homeTeam: { id: "home", name: "Home", formation: "1-2-1", lineup },
  awayTeam: { id: "away", name: "Away", formation: "1-2-1", lineup },
};

describe("API routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ csvPath });
  });

  afterAll(async () => {
    await app.close();
  });

  it("reports the loaded player count", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", players: 6 });
  });

  it("searches players through the HTTP contract", async () => {
    const response = await app.inject({ method: "GET", url: "/players?q=keeper" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ total: 2, players: [{ player_id: "1" }, { player_id: "1" }] });
  });

  it("filters players through canonical roles", async () => {
    const response = await app.inject({ method: "GET", url: "/players?position=FWD" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ total: 2, players: [{ player_id: "4" }, { player_id: "5" }] });
    expect(response.json().players.every((player: { player_roles?: string }) => player.player_roles === "FWD")).toBe(true);
    expect(response.json().players.every((player: { player_positions?: string }) => player.player_positions === undefined)).toBe(true);
  });

  it("paginates players without changing the total", async () => {
    const response = await app.inject({ method: "GET", url: "/players?limit=2&offset=2" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ total: 6, limit: 2, offset: 2 });
    expect(response.json().players).toHaveLength(2);
  });

  it("returns every FIFA version of one player", async () => {
    const response = await app.inject({ method: "GET", url: "/players/1/versions" });
    expect(response.statusCode).toBe(200);
    expect(response.json().players.map((player: { fifa_version: string }) => player.fifa_version)).toEqual(["19", "20"]);
  });

  it("simulates a valid five-a-side match", async () => {
    const response = await app.inject({ method: "POST", url: "/matches/simulate", payload: matchBody });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ seed: "route-test", regulationMinutes: 90, ruleset: "CUSTOM_FIVE_A_SIDE_FOOTBALL" });
    const result = response.json();
    // The whistle waits for the ball to leave the end quarters, so play can run past the announced added time.
    const announced = 90 + result.addedTime.firstHalf + result.addedTime.secondHalf;
    expect(result.durationMinutes).toBeGreaterThanOrEqual(announced);
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.initialSnapshot.players).toHaveLength(10);
    expect(result.initialSnapshot.teamStats.HOME.shots).toBe(0);
    expect(result.teamProfiles.HOME).toHaveProperty("goalkeeping");
    expect(result.events.at(-1).snapshot.teamStats.HOME.shots).toBe(result.teamStats.HOME.shots);
    expect(result.events.at(-1).score).toEqual(result.finalState.score);
  });

  it("rejects duplicate lineup slot IDs", async () => {
    const invalid = structuredClone(matchBody);
    invalid.homeTeam.lineup[1]!.slotId = "GK";
    const response = await app.inject({ method: "POST", url: "/matches/simulate", payload: invalid });
    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toContain("homeTeam.lineup slot IDs must be unique");
  });
});
