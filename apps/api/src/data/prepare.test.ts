import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { COMPACT_PLAYER_COLUMNS, preparePlayerCsv, preparePlayerDataset } from "./prepare.js";
import { parseCsv } from "./csv.js";

const sourceColumns = [
  ...COMPACT_PLAYER_COLUMNS.filter((column) => column !== "player_roles"),
  "player_positions",
  "fifa_update",
  "update_as_of",
];

function sourceRow(values: Record<string, string> = {}): string {
  const defaults: Record<string, string> = {
    player_id: "1",
    fifa_version: "23",
    fifa_update: "1",
    update_as_of: "2023-01-01",
    short_name: "A. Player",
    long_name: "Alpha Player",
    player_positions: "ST",
    overall: "80",
  };
  return sourceColumns.map((column) => {
    const value = values[column] ?? defaults[column] ?? "";
    return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  }).join(",");
}

function sourceCsv(...rows: string[]): string {
  return `${sourceColumns.join(",")}\n${rows.join("\n")}\n`;
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("compact player dataset preparation", () => {
  it("writes the exact compact schema and normalizes ordered, distinct roles", () => {
    const result = preparePlayerCsv(sourceCsv(sourceRow({ player_positions: "CM, CB, CAM, ST" })));
    const [headers, player] = parseCsv(result.csv);

    expect(headers).toEqual(COMPACT_PLAYER_COLUMNS);
    expect(player[4]).toBe("MID|DEF|FWD");
    expect(result).toMatchObject({ sourceRows: 1, outputRows: 1, multiRoleRows: 1 });
  });

  it("keeps the highest update and uses update date to break ties", () => {
    const result = preparePlayerCsv(sourceCsv(
      sourceRow({ fifa_update: "1", update_as_of: "2023-04-01", long_name: "Older update" }),
      sourceRow({ fifa_update: "2", update_as_of: "2023-01-01", long_name: "Earlier date" }),
      sourceRow({ fifa_update: "2", update_as_of: "2023-03-01", long_name: "Selected" }),
      sourceRow({ player_id: "2", fifa_version: "23", long_name: "Other player" }),
      sourceRow({ player_id: "1", fifa_version: "22", long_name: "Other version" }),
    ));
    const records = parseCsv(result.csv).slice(1);

    expect(result).toMatchObject({ sourceRows: 5, outputRows: 3 });
    expect(records.find((row) => row[0] === "1" && row[1] === "23")?.[3]).toBe("Selected");
  });

  it("preserves blank and zero values and emits valid escaped CSV", () => {
    const result = preparePlayerCsv(sourceCsv(sourceRow({
      short_name: "A, Player",
      long_name: 'Alpha "Ace" Player',
      pace: "0",
      mentality_composure: "",
    })));
    const [, player] = parseCsv(result.csv);

    expect(player[2]).toBe("A, Player");
    expect(player[3]).toBe('Alpha "Ace" Player');
    expect(player[8]).toBe("0");
    expect(player[25]).toBe("");
  });

  it("rejects missing columns, identities, names, and unsupported positions", () => {
    expect(() => preparePlayerCsv("player_id\n1\n")).toThrow("CSV is missing required columns");
    expect(() => preparePlayerCsv(sourceCsv(sourceRow({ player_id: "" })))).toThrow("missing player_id");
    expect(() => preparePlayerCsv(sourceCsv(sourceRow({ short_name: "", long_name: "" })))).toThrow("short_name or long_name");
    expect(() => preparePlayerCsv(sourceCsv(sourceRow({ player_positions: "ST, MYSTERY" })))).toThrow("MYSTERY");
  });

  it("rejects identical paths and preserves an existing output after validation fails", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "player-prepare-"));
    temporaryDirectories.push(directory);
    const input = path.join(directory, "raw.csv");
    const output = path.join(directory, "compact.csv");
    await writeFile(input, "invalid\nvalue\n");
    await writeFile(output, "existing output\n");

    await expect(preparePlayerDataset(input, input)).rejects.toThrow("must be different");
    await expect(preparePlayerDataset(input, output)).rejects.toThrow("missing required columns");
    await expect(readFile(output, "utf8")).resolves.toBe("existing output\n");
  });
});
