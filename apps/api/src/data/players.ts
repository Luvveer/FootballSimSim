import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { iterateCsv } from "./csv.js";

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
  const rows = iterateCsv(csv);
  const first = rows.next();
  if (first.done) return [];
  const headers = first.value;
  headers[0] = headers[0]?.replace(/^\uFEFF/, "") ?? "";

  const required = ["player_id", "fifa_version", "fifa_update", "short_name", "long_name", "player_positions"];
  const missing = required.filter((field) => !headers.includes(field));
  if (missing.length > 0) throw new Error(`CSV is missing required columns: ${missing.join(", ")}`);

  const players: PlayerRecord[] = [];
  for (const row of rows) {
    if (!row.some(Boolean)) continue;
    players.push(Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])) as PlayerRecord);
  }
  return canonicalizePlayers(players);
}

export function defaultCsvPath(): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDirectory, "../../../../test.csv");
}

export class PlayerRepository {
  private readonly byHistoricalId = new Map<string, PlayerRecord>();
  private readonly searchIndex: Array<{ record: PlayerRecord; text: string; positions: Set<string> }>;
  private readonly availableVersions: string[];

  private constructor(private readonly records: PlayerRecord[]) {
    for (const record of records) {
      this.byHistoricalId.set(`${record.player_id}\u0000${record.fifa_version}`, record);
    }
    this.searchIndex = records.map((record) => ({
      record,
      text: [record.short_name, record.long_name, record.club_name, record.nationality_name, record.fifa_version]
        .join(" ")
        .toLocaleLowerCase(),
      positions: new Set(record.player_positions.split(",").map((item) => item.trim().toLocaleUpperCase())),
    }));
    this.availableVersions = [...new Set(records.map((player) => player.fifa_version))]
      .sort((a, b) => numeric(b) - numeric(a));
  }

  static async load(csvPath = defaultCsvPath()): Promise<PlayerRepository> {
    return new PlayerRepository(parsePlayers(await readFile(csvPath, "utf8")));
  }

  all(): readonly PlayerRecord[] {
    return this.records;
  }

  versions(): string[] {
    return this.availableVersions;
  }

  find(playerId: string, fifaVersion: string): PlayerRecord | undefined {
    return this.byHistoricalId.get(`${playerId}\u0000${fifaVersion}`);
  }

  search({ query = "", version, position, limit = 30, offset = 0 }: PlayerSearch): PlayerPage {
    const needle = query.trim().toLocaleLowerCase();
    const wantedPosition = position?.trim().toLocaleUpperCase();
    const players: PlayerRecord[] = [];
    let total = 0;
    for (const indexed of this.searchIndex) {
      const matches = (!needle || indexed.text.includes(needle))
        && (!version || indexed.record.fifa_version === version)
        && (!wantedPosition || indexed.positions.has(wantedPosition));
      if (!matches) continue;
      if (total >= offset && players.length < limit) players.push(indexed.record);
      total += 1;
    }
    return { players, total, limit, offset };
  }
}
