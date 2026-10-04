import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import type { MatchConfig } from "@footballsimsim/shared";
import { simulateMatch, validateMatchConfig } from "@footballsimsim/simulation";
import { PlayerRepository } from "./data/players.js";
import { matchConfigFromRequest, RequestValidationError } from "./match-request.js";

export interface AppOptions {
  repository?: PlayerRepository;
  csvPath?: string;
  logger?: boolean;
  routePrefix?: string;
}

function integerQuery(value: unknown, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const repository = options.repository ?? await PlayerRepository.load(options.csvPath);
  const app = Fastify({ logger: options.logger ?? false });
  const routePrefix = options.routePrefix?.replace(/\/$/, "") ?? "";
  await app.register(cors, { origin: true });

  app.get(`${routePrefix}/health`, async () => ({ status: "ok", players: repository.all().length }));

  app.get(`${routePrefix}/players/versions`, async () => ({ versions: repository.versions() }));

  app.get<{ Params: { playerId: string } }>(`${routePrefix}/players/:playerId/versions`, async (request, reply) => {
    const players = repository.versionsFor(request.params.playerId);
    if (players.length === 0) return reply.code(404).send({ error: "Player not found" });
    return { players };
  });

  app.get<{ Querystring: { q?: string; version?: string; position?: string; limit?: string; offset?: string } }>(
    `${routePrefix}/players`,
    async (request) => repository.search({
      query: request.query.q,
      version: request.query.version,
      position: request.query.position,
      limit: integerQuery(request.query.limit, 30, 1, 100),
      offset: integerQuery(request.query.offset, 0, 0, Number.MAX_SAFE_INTEGER),
    }),
  );

  app.get<{ Params: { playerId: string }; Querystring: { version?: string } }>(
    `${routePrefix}/players/:playerId`,
    async (request, reply) => {
      const version = request.query.version;
      const player = version
        ? repository.find(request.params.playerId, version)
        : repository.all().find((candidate) => candidate.player_id === request.params.playerId);
      if (!player) return reply.code(404).send({ error: "Player not found" });
      return player;
    },
  );

  app.post<{ Body: unknown }>(`${routePrefix}/matches/simulate`, async (request, reply) => {
    let config: MatchConfig;
    try {
      config = matchConfigFromRequest(request.body, repository);
      validateMatchConfig(config);
    } catch (error) {
      if (error instanceof RequestValidationError) {
        return reply.code(400).send({ error: error.message, issues: error.issues });
      }
      if (error instanceof Error) {
        return reply.code(400).send({ error: "Invalid match request", issues: [error.message] });
      }
      throw error;
    }
    return simulateMatch(config);
  });

  return app;
}
