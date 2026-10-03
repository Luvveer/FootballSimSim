import { buildApp } from "./app.js";

const app = await buildApp({ logger: true });

try {
  await app.listen({ port: 3001, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
