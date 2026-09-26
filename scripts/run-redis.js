import "dotenv/config";
import { ensureRedisServer, stopRedisServer } from "../src/config/redis-server.js";
import { logger } from "../src/config/logger.js";

await ensureRedisServer();
logger.info("Local development Redis is listening on port 6379. Press Ctrl+C to stop.");

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  logger.info({ signal }, "Stopping local Redis...");
  await stopRedisServer();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
