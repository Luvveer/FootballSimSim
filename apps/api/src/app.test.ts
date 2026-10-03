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
    expect(response.json()).toEqual({ status: "ok", players: 5 });
  });

  it("searches players through the HTTP contract", async () => {
    const response = await app.inject({ method: "GET", url: "/players?q=keeper" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ total: 1, players: [{ player_id: "1" }] });
  });

  it("paginates players without changing the total", async () => {
    const response = await app.inject({ method: "GET", url: "/players?limit=2&offset=2" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ total: 5, limit: 2, offset: 2 });
    expect(response.json().players).toHaveLength(2);
  });

  it("simulates a valid five-a-side match", async () => {
    const response = await app.inject({ method: "POST", url: "/matches/simulate", payload: matchBody });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ seed: "route-test", durationMinutes: 90 });
    expect(response.json().events.length).toBeGreaterThan(0);
  });

  it("rejects duplicate lineup slot IDs", async () => {
    const invalid = structuredClone(matchBody);
    invalid.homeTeam.lineup[1]!.slotId = "GK";
    const response = await app.inject({ method: "POST", url: "/matches/simulate", payload: invalid });
    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toContain("homeTeam.lineup slot IDs must be unique");
  });
});
