import { afterEach, describe, expect, it, vi } from "vitest";
import { FORMATIONS } from "./formations";
import { fetchPlayerVersions, lineupSelections, mapPlayer } from "./api";
import type { Lineup, Player } from "./types";

function apiPlayer(version: string): Player {
  return mapPlayer({
    player_id: "158023",
    fifa_version: version,
    short_name: "L. Messi",
    player_roles: "FWD|MID",
    overall: "94",
  }, 0);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("API player identity", () => {
  it("separates a real player ID from each historical player-version ID", () => {
    const fifa20 = apiPlayer("20.0");
    const fifa21 = apiPlayer("21.0");

    expect(fifa20).toMatchObject({ playerId: "158023", id: "158023:20.0", version: "20.0", position: "FWD" });
    expect(fifa21).toMatchObject({ playerId: "158023", id: "158023:21.0", version: "21.0" });
    expect(new Set([fifa20.id, fifa21.id]).size).toBe(2);
    expect(apiPlayer("20.0").id).toBe(fifa20.id);
  });

  it("continues to accept legacy source positions", () => {
    expect(mapPlayer({
      player_id: "2",
      fifa_version: "23",
      short_name: "Legacy",
      player_positions: "CM, CB",
    }, 0).position).toBe("MID");
  });

  it("serializes the source player ID and FIFA version instead of the composite UI ID", () => {
    const base = apiPlayer("20.0");
    const lineup = Object.fromEntries(FORMATIONS["1-2-1"].map((slot, index) => [
      slot.id,
      { ...base, id: `historical-${index}`, playerId: `source-${index}`, version: `version-${index}` },
    ])) as Lineup;

    expect(lineupSelections(lineup, "1-2-1")).toEqual(FORMATIONS["1-2-1"].map((slot, index) => ({
      slotId: slot.id,
      role: slot.role,
      playerId: `source-${index}`,
      fifaVersion: `version-${index}`,
    })));
  });

  it("requests version history with the source player ID", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ players: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));

    await expect(fetchPlayerVersions(apiPlayer("20.0").playerId)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith("/api/players/158023/versions", { signal: undefined });
  });
});
