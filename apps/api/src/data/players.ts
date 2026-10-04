import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isPitchRole, normalizePosition, normalizePositions, type PitchRole } from "@footballsimsim/shared";
import { iterateCsv } from "./csv.js";
import { COMPACT_PLAYER_COLUMNS } from "./player-schema.js";

export type PlayerRecord = Record<string, string> & {
  player_id: string;
  fifa_version: string;
  short_name: string;
  long_name: string;
  player_roles: string;
};

type RawPlayerRecord = Record<string, string> & {
  player_id: string;
  fifa_version: string;
  fifa_update: string;
  update_as_of: string;
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

export interface DatasetPaths {
  compact: string;
  raw: string;
  fixture: string;
}

const RAW_REQUIRED_COLUMNS = [
  "player_id", "fifa_version", "fifa_update", "update_as_of", "short_name", "long_name", "player_positions",
  "overall", "pace", "shooting", "passing", "dribbling", "defending", "physic",
] as const;

const ROLE_BITS: Readonly<Record<PitchRole, number>> = { GK: 1, DEF: 2, MID: 4, FWD: 8 };

function numeric(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function latest(left: RawPlayerRecord, right: RawPlayerRecord): RawPlayerRecord {
  const leftUpdate = numeric(left.fifa_update);
  const rightUpdate = numeric(right.fifa_update);
  if (leftUpdate !== rightUpdate) return rightUpdate > leftUpdate ? right : left;
  return right.update_as_of.localeCompare(left.update_as_of) > 0 ? right : left;
}

function canonicalizeRawPlayers(players: RawPlayerRecord[]): RawPlayerRecord[] {
  const canonical = new Map<string, RawPlayerRecord>();
  for (const player of players) {
    const key = `${player.player_id}\u0000${player.fifa_version}`;
    const existing = canonical.get(key);
    canonical.set(key, existing ? latest(existing, player) : player);
  }
  return [...canonical.values()];
}

function requireColumns(headers: string[], required: readonly string[]): void {
  const missing = required.filter((field) => !headers.includes(field));
  if (missing.length > 0) throw new Error(`CSV is missing required columns: ${missing.join(", ")}`);
}

function validateIdentity(record: Pick<PlayerRecord, "player_id" | "fifa_version" | "short_name" | "long_name">, row: number): void {
  if (!record.player_id.trim()) throw new Error(`CSV row ${row} is missing player_id`);
  if (!record.fifa_version.trim()) throw new Error(`CSV row ${row} is missing fifa_version`);
  if (!record.short_name.trim() && !record.long_name.trim()) {
    throw new Error(`CSV row ${row} must have a short_name or long_name`);
  }
}

function parseCompactRoles(value: string, row: number): PitchRole[] {
  const roles = value.split("|").filter(Boolean);
  if (roles.length === 0 || roles.some((role) => !isPitchRole(role)) || new Set(roles).size !== roles.length) {
    throw new Error(`CSV row ${row} has invalid player_roles: ${value || "(blank)"}`);
  }
  return roles as PitchRole[];
}

function parseRawRoles(value: string, row: number): PitchRole[] {
  const positions = value.split(",").map((position) => position.trim()).filter(Boolean);
  const unsupported = positions.filter((position) => !normalizePosition(position));
  if (positions.length === 0 || unsupported.length > 0) {
    throw new Error(`CSV row ${row} has invalid player_positions: ${unsupported.join(", ") || "(blank)"}`);
  }
  return normalizePositions(positions);
}

function rowRecord(headers: string[], row: string[]): Record<string, string> {
  return Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
}

function compactRecord(source: Record<string, string>, roles: readonly PitchRole[]): PlayerRecord {
  return Object.fromEntries(COMPACT_PLAYER_COLUMNS.map((column) => [
    column,
    column === "player_roles" ? roles.join("|") : source[column] ?? "",
  ])) as PlayerRecord;
}

function parseCompactRows(headers: string[], rows: Generator<string[]>): PlayerRecord[] {
  requireColumns(headers, COMPACT_PLAYER_COLUMNS);
  const players: PlayerRecord[] = [];
  let rowNumber = 1;
  for (const row of rows) {
    rowNumber += 1;
    if (!row.some(Boolean)) continue;
    const source = rowRecord(headers, row) as PlayerRecord;
    validateIdentity(source, rowNumber);
    const roles = parseCompactRoles(source.player_roles, rowNumber);
    players.push(compactRecord(source, roles));
  }
  return players;
}

function parseRawRows(headers: string[], rows: Generator<string[]>): PlayerRecord[] {
  requireColumns(headers, RAW_REQUIRED_COLUMNS);
  const rawPlayers: RawPlayerRecord[] = [];
  let rowNumber = 1;
  for (const row of rows) {
    rowNumber += 1;
    if (!row.some(Boolean)) continue;
    const raw = rowRecord(headers, row) as RawPlayerRecord;
    validateIdentity(raw, rowNumber);
    parseRawRoles(raw.player_positions, rowNumber);
    rawPlayers.push(raw);
  }
  return canonicalizeRawPlayers(rawPlayers).map((raw) => compactRecord(raw, parseRawRoles(raw.player_positions, 0)));
}

export function parsePlayers(csv: string): PlayerRecord[] {
  const rows = iterateCsv(csv);
  const first = rows.next();
  if (first.done) return [];
  const headers = first.value;
  headers[0] = headers[0]?.replace(/^\uFEFF/, "") ?? "";
  return headers.includes("player_roles") ? parseCompactRows(headers, rows) : parseRawRows(headers, rows);
}

export function playerRoles(record: PlayerRecord): PitchRole[] {
  return record.player_roles.split("|") as PitchRole[];
}

function repositoryRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../");
}

export function defaultDatasetPaths(): DatasetPaths {
  const root = repositoryRoot();
  return {
    compact: path.join(root, "players.csv"),
    raw: path.join(root, "male_players.csv"),
    fixture: path.join(root, "test.csv"),
  };
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function roleMask(roles: readonly PitchRole[]): number {
  return roles.reduce((mask, role) => mask | ROLE_BITS[role], 0);
}

export class PlayerRepository {
  private readonly byHistoricalId = new Map<string, PlayerRecord>();
  private readonly byPlayerId = new Map<string, PlayerRecord[]>();
  private readonly searchIndex: Array<{ record: PlayerRecord; text: string; roleMask: number }>;
  private readonly availableVersions: string[];

  private constructor(private readonly records: PlayerRecord[]) {
    for (const record of records) {
      this.byHistoricalId.set(`${record.player_id}\u0000${record.fifa_version}`, record);
      const versions = this.byPlayerId.get(record.player_id) ?? [];
      versions.push(record);
      this.byPlayerId.set(record.player_id, versions);
    }
    for (const versions of this.byPlayerId.values()) {
      versions.sort((a, b) => numeric(a.fifa_version) - numeric(b.fifa_version));
    }
    this.searchIndex = records.map((record) => ({
      record,
      text: normalizeSearch([record.short_name, record.long_name, record.club_name, record.nationality_name,
        record.fifa_version, `FIFA ${Number(record.fifa_version)}`, String(2000 + Number(record.fifa_version))].join(" ")),
      roleMask: roleMask(playerRoles(record)),
    }));
    this.availableVersions = [...new Set(records.map((player) => player.fifa_version))]
      .sort((a, b) => numeric(b) - numeric(a));
  }

  static async load(csvPath?: string, paths: DatasetPaths = defaultDatasetPaths()): Promise<PlayerRepository> {
    if (csvPath) return new PlayerRepository(parsePlayers(await readFile(csvPath, "utf8")));
    try {
      return new PlayerRepository(parsePlayers(await readFile(paths.compact, "utf8")));
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }

    try {
      await access(paths.raw);
    } catch (error) {
      if (isMissingFile(error)) return new PlayerRepository(parsePlayers(await readFile(paths.fixture, "utf8")));
      throw error;
    }
    throw new Error(`Compact player dataset not found at ${paths.compact}. Run npm run data:prepare before starting the API.`);
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

  versionsFor(playerId: string): readonly PlayerRecord[] {
    return this.byPlayerId.get(playerId) ?? [];
  }

  search({ query = "", version, position, limit = 30, offset = 0 }: PlayerSearch): PlayerPage {
    const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
    const requestedPosition = position?.trim().toUpperCase();
    const wantedRole = requestedPosition && isPitchRole(requestedPosition) ? requestedPosition : undefined;
    const wantedRoleBit = wantedRole ? ROLE_BITS[wantedRole] : 0;
    const players: PlayerRecord[] = [];
    let total = 0;
    for (const indexed of this.searchIndex) {
      const matches = terms.every((term) => indexed.text.includes(term))
        && (!version || indexed.record.fifa_version === version)
        && (!requestedPosition || (wantedRoleBit !== 0 && (indexed.roleMask & wantedRoleBit) !== 0));
      if (!matches) continue;
      if (total >= offset && players.length < limit) players.push(indexed.record);
      total += 1;
    }
    return { players, total, limit, offset };
  }
}
