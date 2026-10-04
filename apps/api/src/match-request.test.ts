import { describe, expect, it } from "vitest";
import type { PlayerRecord } from "./data/players.js";
import { toHistoricalPlayer } from "./match-request.js";

function record(overrides: Partial<PlayerRecord> = {}): PlayerRecord {
  return {
    player_id: "1",
    fifa_version: "15.0",
    fifa_update: "2.0",
    short_name: "A. Player",
    long_name: "An Example Player",
    player_positions: "CAM",
    overall: "82",
    pace: "80",
    shooting: "80",
    passing: "80",
    dribbling: "80",
    defending: "80",
    physic: "80",
    ...overrides,
  };
}

describe("historical player attribute conversion", () => {
  it("preserves missing and invalid optional attributes as undefined", () => {
    const player = toHistoricalPlayer(record({
      mentality_composure: "",
      mentality_vision: "   ",
      power_stamina: "not-a-number",
    }));

    expect(player.attributes.composure).toBeUndefined();
    expect(player.attributes.vision).toBeUndefined();
    expect(player.attributes.stamina).toBeUndefined();
    expect(player.attributes.reactions).toBeUndefined();
  });

  it("distinguishes a genuine zero from a missing optional attribute", () => {
    const player = toHistoricalPlayer(record({
      mentality_penalties: "0",
      attacking_finishing: "87",
    }));

    expect(player.attributes.penalties).toBe(0);
    expect(player.attributes.finishing).toBe(87);
  });

  it("retains the existing zero fallback for missing required broad ratings", () => {
    const player = toHistoricalPlayer(record({ pace: "", overall: "invalid" }));

    expect(player.attributes.pace).toBe(0);
    expect(player.overall).toBe(0);
  });
});
