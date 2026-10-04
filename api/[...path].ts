import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { buildApp } from "../apps/api/src/app.js";

const datasetPath = path.join(process.cwd(), "players.csv");
const appPromise = buildApp({
  csvPath: datasetPath,
  routePrefix: "/api",
});

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const app = await appPromise;
  await app.ready();
  app.server.emit("request", request, response);
}
