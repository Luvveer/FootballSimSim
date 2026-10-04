import { describe, expect, it } from "vitest";
import type { Player } from "./types";
import {
  assignPlayer,
  emptyLineup,
  isLineupComplete,
  lineupFilledCount,
  lineupHasPlayer,
  resolveActiveSlot,
  visibleLineup,
} from "./lineup";

function player(id: string): Player {
  return {
    id,
    playerId: id.split(":")[0]!,
    version: id.split(":")[1] ?? "20",
    name: id,
    rating: 80,
    position: "MID",
    club: "Club",
    nationality: "Country",
    pace: 80,
    shooting: 80,
    passing: 80,
    dribbling: 80,
    defending: 80,
    physical: 80,
  };
}

describe("formation-scoped lineup state", () => {
  it("keeps a preferred slot when it belongs to the formation", () => {
    expect(resolveActiveSlot("2-0-2", emptyLineup("2-0-2"), "RCB")).toBe("RCB");
  });

  it("replaces an incompatible slot with the first empty visible slot", () => {
    const lineup = emptyLineup("2-0-2");
    lineup.LST = player("1:20");

    expect(resolveActiveSlot("2-0-2", lineup, "LM")).toBe("RST");
  });

  it("assigns through a valid visible slot and removes hidden properties", () => {
    const lineup = { ...emptyLineup("2-0-2"), LM: player("ghost:20") };
    const result = assignPlayer(lineup, "2-0-2", "LM", player("visible:20"));

    expect(result.selectedSlot).toBe("LST");
    expect(result.lineup.LST?.id).toBe("visible:20");
    expect(result.lineup).not.toHaveProperty("LM");
    expect(Object.keys(result.lineup)).toHaveLength(5);
  });

  it("ignores hidden players in counts, completeness, and duplicate checks", () => {
    const lineup = { ...emptyLineup("1-2-1"), HIDDEN: player("ghost:20") };

    expect(lineupFilledCount(lineup, "1-2-1")).toBe(0);
    expect(isLineupComplete(lineup, "1-2-1")).toBe(false);
    expect(lineupHasPlayer(lineup, "1-2-1", "ghost:20")).toBe(false);
    expect(visibleLineup(lineup, "1-2-1")).not.toHaveProperty("HIDDEN");
  });

  it("requires all five visible slots for completeness", () => {
    const lineup = emptyLineup("1-2-1");
    for (const slot of Object.keys(lineup)) lineup[slot] = player(`${slot}:20`);

    expect(lineupFilledCount(lineup, "1-2-1")).toBe(5);
    expect(isLineupComplete(lineup, "1-2-1")).toBe(true);
  });
});
