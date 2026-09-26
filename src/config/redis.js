import Redis from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

export function createRedis(worker = false) {
  const client = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: worker ? null : 1,
    connectTimeout: 2000,
    enableReadyCheck: true,
    retryStrategy: () => null, // Don't hang or spam retry loops when Redis is not present
  });
  client.on("error", (err) => {
    // Suppress spam if disconnected
    if (client.status !== "end") {
      logger.debug({ code: "REDIS_CONNECTION_ERROR", err: err.message }, "Redis connection event");
    }
  });
  return client;
}
