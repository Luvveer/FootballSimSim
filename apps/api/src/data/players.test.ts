import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COMPACT_PLAYER_COLUMNS } from "./player-schema.js";
import { PlayerRepository, parsePlayers } from "./players.js";

const rawHeader = [
  "player_id", "fifa_version", "fifa_update", "update_as_of", "short_name", "long_name", "player_positions",
  "overall", "club_name", "nationality_name", "pace", "shooting", "passing", "dribbling", "defending", "physic",
].join(",");

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function compactRow(overrides: Record<string, string> = {}): string {
  const defaults: Record<string, string> = {
    player_id: "1", fifa_version: "24.0", short_name: "A", long_name: "Alpha", player_roles: "FWD",
    overall: "80", club_name: "Club", nationality_name: "Country", pace: "80", shooting: "80", passing: "80",
    dribbling: "80", defending: "80", physic: "80",
  };
  return COMPACT_PLAYER_COLUMNS.map((column) => csvField(overrides[column] ?? defaults[column] ?? "")).join(",");
}

function compactCsv(...rows: string[]): string {
  return `${COMPACT_PLAYER_COLUMNS.join(",")}\n${rows.join("\n")}\n`;
}

describe("player data", () => {
  it("loads the exact compact shape and preserves quoted commas", () => {
    const [player] = parsePlayers(compactCsv(compactRow({ long_name: "Alpha, Player", player_roles: "MID|FWD" })));

    expect(player).toMatchObject({ player_id: "1", long_name: "Alpha, Player", player_roles: "MID|FWD" });
    expect(Object.keys(player)).toEqual(COMPACT_PLAYER_COLUMNS);
  });

  it("rejects incomplete compact data and invalid canonical roles", () => {
    expect(() => parsePlayers("player_id,player_roles\n1,FWD\n")).toThrow("CSV is missing required columns");
    expect(() => parsePlayers(compactCsv(compactRow({ player_roles: "ST" })))).toThrow("invalid player_roles");
    expect(() => parsePlayers(compactCsv(compactRow({ player_roles: "FWD|FWD" })))).toThrow("invalid player_roles");
  });

  it("projects raw data and keeps the latest update for each player and FIFA version", () => {
    const players = parsePlayers([
      rawHeader,
      "1,20,1,2020-01-01,A,Old,ST,80,Club,Country,80,80,80,80,80,80",
      '1,20,3,2020-03-01,A,"Newest, Player","ST, CAM",82,Club,Country,80,80,80,80,80,80',
      "1,20,2,2020-02-01,A,Newer,ST,81,Club,Country,80,80,80,80,80,80",
      "1,21,1,2021-01-01,A,Other version,ST,84,Club,Country,80,80,80,80,80,80",
    ].join("\n"));

    expect(players).toHaveLength(2);
    expect(players.find((player) => player.fifa_version === "20")).toMatchObject({
      long_name: "Newest, Player",
      player_roles: "FWD|MID",
    });
    expect(Object.keys(players[0]!)).toEqual(COMPACT_PLAYER_COLUMNS);
  });

  it("groups one player's raw fixture versions in chronological order", async () => {
    const repository = await PlayerRepository.load(fileURLToPath(new URL("../../test/players.csv", import.meta.url)));
    expect(repository.versionsFor("1").map((player) => player.fifa_version)).toEqual(["19", "20"]);
    expect(repository.versionsFor("missing")).toEqual([]);
  });

  it("searches accents, combined terms, clubs, years, and multi-role records", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "player-search-"));
    try {
      const file = path.join(directory, "players.csv");
      await writeFile(file, compactCsv(
        compactRow({ player_id: "1", fifa_version: "24.0", short_name: "K. Mbappé", long_name: "Kylian Mbappé", player_roles: "FWD", club_name: "Paris", nationality_name: "France", overall: "91" }),
        compactRow({ player_id: "1", fifa_version: "23.0", short_name: "K. Mbappé", long_name: "Kylian Mbappé", player_roles: "FWD", club_name: "Paris", nationality_name: "France", overall: "90" }),
        compactRow({ player_id: "2", short_name: "B", long_name: "Beta", player_roles: "GK", club_name: "London", nationality_name: "England" }),
        compactRow({ player_id: "3", short_name: "C", long_name: "Charlie", player_roles: "MID|DEF", club_name: "Rome", nationality_name: "Italy" }),
      ));
      const repository = await PlayerRepository.load(file);
      expect(repository.search({ query: "Mbappe" }).total).toBe(2);
      expect(repository.search({ query: "  MBAPPE  FIFA 24 " }).total).toBe(1);
      expect(repository.search({ query: "2024", position: "FWD" }).total).toBe(1);
      expect(repository.search({ query: "Charlie", position: "MID" }).total).toBe(1);
      expect(repository.search({ query: "Charlie", position: "DEF" }).total).toBe(1);
      expect(repository.search({ query: "Charlie", position: "CDM" }).total).toBe(0);
      expect(repository.search({ query: "Paris Mbappe", limit: 1, offset: 1 })).toMatchObject({ total: 2, players: [{ fifa_version: "23.0" }] });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("requires preparation when raw data exists and otherwise loads the fixture", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "player-defaults-"));
    try {
      const paths = {
        compact: path.join(directory, "players.csv"),
        raw: path.join(directory, "male_players.csv"),
        fixture: path.join(directory, "test.csv"),
      };
      await writeFile(paths.raw, "raw dataset marker");
      await writeFile(paths.fixture, compactCsv(compactRow()));

      await expect(PlayerRepository.load(undefined, paths)).rejects.toThrow("npm run data:prepare");
      await writeFile(paths.compact, compactCsv(compactRow({ player_id: "compact" })));
      await expect(PlayerRepository.load(undefined, paths)).resolves.toMatchObject({
        records: [{ player_id: "compact" }],
      });
      await rm(paths.compact);
      await rm(paths.raw);
      await expect(PlayerRepository.load(undefined, paths)).resolves.toMatchObject({
        records: [{ player_id: "1" }],
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
