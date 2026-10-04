import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePosition, normalizePositions } from "@footballsimsim/shared";
import { iterateCsv } from "./csv.js";
import { COMPACT_PLAYER_COLUMNS } from "./player-schema.js";

export { COMPACT_PLAYER_COLUMNS } from "./player-schema.js";

const SOURCE_COLUMNS = [
  ...COMPACT_PLAYER_COLUMNS.filter((column) => column !== "player_roles"),
  "player_positions",
  "fifa_update",
  "update_as_of",
] as const;

interface PreparedRow {
  values: string[];
  fifaUpdate: number;
  updateAsOf: string;
}

export interface PreparationResult {
  csv: string;
  sourceRows: number;
  outputRows: number;
  multiRoleRows: number;
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function compareUpdates(candidate: PreparedRow, current: PreparedRow): number {
  if (candidate.fifaUpdate !== current.fifaUpdate) {
    return candidate.fifaUpdate > current.fifaUpdate ? 1 : -1;
  }
  return candidate.updateAsOf.localeCompare(current.updateAsOf);
}

function requireValue(value: string, field: string, rowNumber: number): void {
  if (!value.trim()) throw new Error(`CSV row ${rowNumber} is missing ${field}`);
}

export function preparePlayerCsv(input: string): PreparationResult {
  const rows = iterateCsv(input);
  const first = rows.next();
  if (first.done) throw new Error("CSV is empty");

  const headers = first.value;
  headers[0] = headers[0]?.replace(/^\uFEFF/, "") ?? "";
  const indexes = new Map(headers.map((header, index) => [header, index]));
  const missing = SOURCE_COLUMNS.filter((column) => !indexes.has(column));
  if (missing.length > 0) throw new Error(`CSV is missing required columns: ${missing.join(", ")}`);

  const valueAt = (row: string[], field: string): string => row[indexes.get(field)!] ?? "";
  const canonical = new Map<string, PreparedRow>();
  let sourceRows = 0;
  let rowNumber = 1;

  for (const row of rows) {
    rowNumber += 1;
    if (!row.some(Boolean)) continue;
    sourceRows += 1;

    const playerId = valueAt(row, "player_id");
    const fifaVersion = valueAt(row, "fifa_version");
    const shortName = valueAt(row, "short_name");
    const longName = valueAt(row, "long_name");
    requireValue(playerId, "player_id", rowNumber);
    requireValue(fifaVersion, "fifa_version", rowNumber);
    if (!shortName.trim() && !longName.trim()) {
      throw new Error(`CSV row ${rowNumber} must have a short_name or long_name`);
    }

    const sourcePositions = valueAt(row, "player_positions");
    requireValue(sourcePositions, "player_positions", rowNumber);
    const positions = sourcePositions.split(",").map((position) => position.trim()).filter(Boolean);
    const unsupported = positions.filter((position) => !normalizePosition(position));
    if (unsupported.length > 0) {
      throw new Error(`CSV row ${rowNumber} has unsupported player position(s): ${unsupported.join(", ")}`);
    }
    const roles = normalizePositions(positions);

    const rawUpdate = valueAt(row, "fifa_update");
    const parsedUpdate = Number(rawUpdate);
    const prepared: PreparedRow = {
      values: COMPACT_PLAYER_COLUMNS.map((column) => {
        if (column === "player_roles") return roles.join("|");
        return valueAt(row, column);
      }),
      fifaUpdate: Number.isFinite(parsedUpdate) ? parsedUpdate : Number.NEGATIVE_INFINITY,
      updateAsOf: valueAt(row, "update_as_of"),
    };
    const key = `${playerId}\u0000${fifaVersion}`;
    const existing = canonical.get(key);
    if (!existing || compareUpdates(prepared, existing) > 0) canonical.set(key, prepared);
  }

  const output = [
    COMPACT_PLAYER_COLUMNS.join(","),
    ...[...canonical.values()].map((row) => row.values.map(csvField).join(",")),
  ].join("\n") + "\n";

  return {
    csv: output,
    sourceRows,
    outputRows: canonical.size,
    multiRoleRows: [...canonical.values()].filter((row) => row.values[4]?.includes("|")).length,
  };
}

function repositoryRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../");
}

export async function preparePlayerDataset(inputPath: string, outputPath: string): Promise<Omit<PreparationResult, "csv">> {
  const resolvedInput = path.resolve(inputPath);
  const resolvedOutput = path.resolve(outputPath);
  if (resolvedInput === resolvedOutput) throw new Error("Input and output CSV paths must be different");

  const result = preparePlayerCsv(await readFile(resolvedInput, "utf8"));
  const temporaryOutput = `${resolvedOutput}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryOutput, result.csv, "utf8");
    await rename(temporaryOutput, resolvedOutput);
  } catch (error) {
    await unlink(temporaryOutput).catch(() => undefined);
    throw error;
  }
  const { csv: _csv, ...summary } = result;
  return summary;
}

async function main(): Promise<void> {
  const root = repositoryRoot();
  const inputPath = process.argv[2] ? path.resolve(root, process.argv[2]) : path.join(root, "male_players.csv");
  const outputPath = process.argv[3] ? path.resolve(root, process.argv[3]) : path.join(root, "players.csv");
  const result = await preparePlayerDataset(inputPath, outputPath);
  console.log(`Prepared ${result.outputRows.toLocaleString()} players from ${result.sourceRows.toLocaleString()} source rows`);
  console.log(`Multi-role players: ${result.multiRoleRows.toLocaleString()}`);
  console.log(`Wrote ${outputPath}`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
