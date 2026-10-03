import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "./csv.js";

export type PlayerRecord = Record<string, string> & {
  player_id: string;
  fifa_version: string;
  fifa_update: string;
  short_name: string;
  long_name: string;
  player_positions: string;
};

export interface PlayerSearch {
  query?: string;
  version?: string;
  position?: string;
  limit?: number;
  offset?: number;
}

export interface PlayerPage {
  players: PlayerRecord[];
  total: number;
  limit: number;
  offset: number;
}

function numeric(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function latest(left: PlayerRecord, right: PlayerRecord): PlayerRecord {
  const updateDifference = numeric(right.fifa_update) - numeric(left.fifa_update);
  if (updateDifference !== 0) return updateDifference > 0 ? right : left;
  return (right.update_as_of ?? "").localeCompare(left.update_as_of ?? "") > 0 ? right : left;
}

export function canonicalizePlayers(players: PlayerRecord[]): PlayerRecord[] {
  const canonical = new Map<string, PlayerRecord>();
  for (const player of players) {
    const key = `${player.player_id}\u0000${player.fifa_version}`;
    const existing = canonical.get(key);
    canonical.set(key, existing ? latest(existing, player) : player);
  }
  return [...canonical.values()];
}

export function parsePlayers(csv: string): PlayerRecord[] {
  const [headers, ...rows] = parseCsv(csv);
  if (!headers) return [];
  headers[0] = headers[0]?.replace(/^\uFEFF/, "") ?? "";

  const required = ["player_id", "fifa_version", "fifa_update", "short_name", "long_name", "player_positions"];
  const missing = required.filter((field) => !headers.includes(field));
  if (missing.length > 0) throw new Error(`CSV is missing required columns: ${missing.join(", ")}`);

  return canonicalizePlayers(
    rows.filter((row) => row.some(Boolean)).map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])) as PlayerRecord,
    ),
  );
}

export function defaultCsvPath(): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDirectory, "../../../../test.csv");
}

export class PlayerRepository {
  private constructor(private readonly records: PlayerRecord[]) {}

  static async load(csvPath = defaultCsvPath()): Promise<PlayerRepository> {
    return new PlayerRepository(parsePlayers(await readFile(csvPath, "utf8")));
  }

  all(): readonly PlayerRecord[] {
    return this.records;
  }

  versions(): string[] {
    return [...new Set(this.records.map((player) => player.fifa_version))].sort((a, b) => numeric(b) - numeric(a));
  }

  find(playerId: string, fifaVersion: string): PlayerRecord | undefined {
    return this.records.find((player) => player.player_id === playerId && player.fifa_version === fifaVersion);
  }

  search({ query = "", version, position, limit = 30, offset = 0 }: PlayerSearch): PlayerPage {
    const needle = query.trim().toLocaleLowerCase();
    const wantedPosition = position?.trim().toLocaleUpperCase();
    const matching = this.records.filter((player) => {
      const nameMatches = !needle || `${player.short_name} ${player.long_name}`.toLocaleLowerCase().includes(needle);
      const versionMatches = !version || player.fifa_version === version;
      const positions = player.player_positions.split(",").map((item) => item.trim().toLocaleUpperCase());
      return nameMatches && versionMatches && (!wantedPosition || positions.includes(wantedPosition));
    });
    return { players: matching.slice(offset, offset + limit), total: matching.length, limit, offset };
  }
}
