import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PlayerRepository, parsePlayers } from "./players.js";

const header = "player_id,fifa_version,fifa_update,update_as_of,short_name,long_name,player_positions,overall,club_name,nationality_name";

describe("player data", () => {
  it("preserves source columns and quoted commas", () => {
    const [player] = parsePlayers(`${header}\n1,20,1,2020-01-01,A,Alpha,\"GK, CB\",80,Club,Country\n`);
    expect(player).toMatchObject({ player_id: "1", player_positions: "GK, CB", overall: "80" });
    expect(Object.keys(player)).toHaveLength(10);
  });

  it("keeps the latest update for each player and FIFA version", () => {
    const players = parsePlayers([
      header,
      "1,20,1,2020-01-01,A,Old,GK,80,Club,Country",
      "1,20,3,2020-03-01,A,Newest,GK,82,Club,Country",
      "1,20,2,2020-02-01,A,Newer,GK,81,Club,Country",
      "1,21,1,2021-01-01,A,Other version,GK,84,Club,Country",
    ].join("\n"));
    expect(players).toHaveLength(2);
    expect(players.find((player) => player.fifa_version === "20")?.long_name).toBe("Newest");
  });
});


it("searches accents, combined terms, clubs and FIFA years across pages", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "player-search-"));
  try {
    const file = path.join(directory, "players.csv");
    await writeFile(file, [header,
      '1,24.0,1,2023-01-01,K. Mbappé,Kylian Mbappé,"ST, LW",91,Paris,France',
      '1,23.0,1,2022-01-01,K. Mbappé,Kylian Mbappé,ST,90,Paris,France',
      '2,24.0,1,2023-01-01,B,Beta,GK,80,London,England',
    ].join("\n"));
    const repository = await PlayerRepository.load(file);
    expect(repository.search({ query: "Mbappe" }).total).toBe(2);
    expect(repository.search({ query: "  MBAPPE  FIFA 24 " }).total).toBe(1);
    expect(repository.search({ query: "2024", position: "LW" }).total).toBe(1);
    expect(repository.search({ query: "Paris Mbappe", limit: 1, offset: 1 })).toMatchObject({ total: 2, players: [{ fifa_version: "23.0" }] });
    expect(repository.search({ query: "missing" }).total).toBe(0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
