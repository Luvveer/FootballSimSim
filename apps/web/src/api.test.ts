import { describe, expect, it } from "vitest";
import { mapPlayer } from "./api";

describe("compact API player mapping", () => {
  it("uses the first canonical role from a compact player response", () => {
    expect(mapPlayer({
      player_id: "1",
      fifa_version: "23",
      short_name: "Example",
      player_roles: "FWD|MID",
      overall: "88",
    }, 0)).toMatchObject({ id: "1", version: "23", position: "FWD", rating: 88 });
  });

  it("continues to accept legacy source positions", () => {
    expect(mapPlayer({ player_id: "2", short_name: "Legacy", player_positions: "CM, CB" }, 0).position).toBe("MID");
  });
});
