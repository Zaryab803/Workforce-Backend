import { createServer } from "node:http";
import { attachRealtime } from "./realtime/server.js";
import { createApp } from "./app.js";
import { prisma } from "./config/prisma.js";
import { createRedis } from "./config/redis.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { ensureDbServer, stopDbServer } from "./config/db-server.js";

// Ensure persistent PGlite PostgreSQL server is up and running
try {
  await ensureDbServer();
} catch (err) {
  logger.warn({ err: err.message }, "Notice on embedded database startup");
}

let redis = null;
try {
  const r = createRedis();
  await r.connect();
  redis = r;
} catch (err) {
  logger.warn(
    { err: err.message },
    "Redis connection failed. Running with in-memory cache/realtime.",
  );
}

try {
  await prisma.$connect();
  logger.info("Connected to PostgreSQL database successfully");
} catch (err) {
  logger.warn(
    { err: err.message },
    "Database connection failed. Make sure PostgreSQL is running for DB queries.",
  );
}

const app = createApp({ db: prisma, redis });
const server = createServer(app);

let realtime = null;
try {
  realtime = await attachRealtime(server, { db: prisma, redis });
  logger.info("Realtime WebSocket service attached and ready on /socket.io");
} catch (err) {
  logger.warn({ err: err.message }, "Realtime WebSocket attachment failed.");
}

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "API ready");
  logger.info(`Swagger UI: http://localhost:${env.PORT}/api/docs`);
});

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  logger.info({ signal }, "API shutdown");
  const timeout = setTimeout(() => process.exit(1), 30000).unref();
  if (realtime) await realtime.close();
  if (redis) await redis.quit();
  await prisma.$disconnect();
  await stopDbServer();
  clearTimeout(timeout);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
