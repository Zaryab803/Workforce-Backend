import { startWorkers } from "./start-workers.js";
import { prisma } from "../config/prisma.js";
import { createRedis } from "../config/redis.js";
import { logger } from "../config/logger.js";
import { ensureDbServer, stopDbServer } from "../config/db-server.js";
import { ensureRedisServer, stopRedisServer } from "../config/redis-server.js";

await ensureDbServer();
await ensureRedisServer();

const connection = createRedis(true);
await connection.connect();
await prisma.$connect();
const runtime = await startWorkers({ db: prisma, connection });
let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  logger.info({ signal }, "Worker shutdown");
  const timeout = setTimeout(() => process.exit(1), 30000).unref();
  await runtime.close();
  await connection.quit();
  await prisma.$disconnect();
  await stopRedisServer();
  await stopDbServer();
  clearTimeout(timeout);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
logger.info("Background workers ready");

