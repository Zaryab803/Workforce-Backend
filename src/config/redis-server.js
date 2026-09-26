import net from "node:net";
import { logger } from "./logger.js";

let redisServer = null;

function isPortInUse(port, host = "127.0.0.1") {
  return new Promise((res) => {
    const tester = net
      .createServer()
      .once("error", (err) => {
        if (err.code === "EADDRINUSE") {
          res(true);
        } else {
          res(false);
        }
      })
      .once("listening", () => {
        tester.once("close", () => res(false)).close();
      })
      .listen(port, host);
  });
}

export async function ensureRedisServer() {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const redisUrl = process.env.REDIS_URL || "";
  if (!redisUrl.includes("localhost:6379") && !redisUrl.includes("127.0.0.1:6379")) {
    return;
  }

  const port = 6379;
  const inUse = await isPortInUse(port);
  if (inUse) {
    logger.info({ port }, "Redis server already running on port");
    return;
  }

  try {
    const { RedisMemoryServer } = await import("redis-memory-server");
    redisServer = new RedisMemoryServer({
      instance: { port },
      autoStart: false,
    });
    await redisServer.start();
    logger.info({ port }, "Local development Redis active and ready");
  } catch (err) {
    logger.warn({ err: err.message }, "Notice on embedded Redis startup");
  }
}

export async function stopRedisServer() {
  if (redisServer) {
    await redisServer.stop();
    redisServer = null;
  }
}
