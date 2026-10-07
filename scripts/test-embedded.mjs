// A disposable PostgreSQL-WASM + real Redis harness; never touches Supabase.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { RedisMemoryServer } from "redis-memory-server";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import Redis from "ioredis";
const db = await PGlite.create();
const schema = "workforce_test";
await db.exec(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};`);
for (const migration of readdirSync("prisma/migrations").sort()) {
  const file = `prisma/migrations/${migration}/migration.sql`;
  if (existsSync(file)) await db.exec(readFileSync(file, "utf8"));
}
const server = new PGLiteSocketServer({ db, port: 55432, host: "127.0.0.1" });
const cached = resolve(
  "node_modules/.cache/redis-memory-server/redis-binaries/stable/redis-server",
);
// redis-memory-server quotes system paths for its version shell probe, then incorrectly
// passes those quotes to spawn on Windows. Strip only the surrounding quotes at spawn lookup.
if (process.platform === "win32") {
  const { default: binaryModule } =
    await import("redis-memory-server/lib/util/RedisBinary.js");
  const binary = binaryModule.default;
  const getPath = binary.getPath.bind(binary);
  binary.getPath = async (...args) =>
    (await getPath(...args)).replace(/^"(.*)"$/, "$1");
  // Memurai can omit its readiness line when stdout is redirected on Windows.
  // Confirm the isolated server with PING instead of waiting indefinitely for logs.
  const { default: instanceModule } =
    await import("redis-memory-server/lib/util/RedisInstance.js");
  const instance = instanceModule.default;
  const launch = instance.prototype._launchRedisServer;
  instance.prototype._launchRedisServer = function (...args) {
    const child = launch.apply(this, args);
    const probe = new Redis({
      host: "127.0.0.1",
      port: this.opts.instance.port,
      connectTimeout: 1000,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => (attempt < 30 ? 100 : null),
    });
    probe.on("error", () => {});
    const timeout = setTimeout(() => {
      probe.disconnect();
      if (!this.isInstanceReady) this.instanceFailed("Test Redis startup timed out");
    }, 15000);
    const finish = () => {
      clearTimeout(timeout);
      probe.disconnect();
    };
    child.once("exit", finish);
    probe.once("ready", async () => {
      try {
        if ((await probe.ping()) === "PONG" && !this.isInstanceReady)
          this.instanceReady();
      } catch {
        this.instanceFailed("Test Redis readiness check failed");
      } finally {
        finish();
      }
    });
    return child;
  };
}
const cachedWindows = resolve(
  "node_modules/.cache/redis-memory-server/redis-binaries/8.10.2/memurai.exe",
);
const redis = new RedisMemoryServer({
  autoStart: false,
  instance: { args: ["--logfile", ""] },
  binary: process.env.REDISMS_SYSTEM_BINARY
    ? { systemBinary: process.env.REDISMS_SYSTEM_BINARY }
    : process.platform === "win32" && existsSync(cachedWindows)
      ? { systemBinary: cachedWindows }
      : existsSync(cached)
        ? { systemBinary: cached }
        : { version: "8.10.2" },
});
try {
  await server.start();
  const redisPort = await redis.getPort();
  const url =
    "postgresql://postgres:postgres@127.0.0.1:55432/postgres?schema=workforce_test&connection_limit=1";
  const child = spawn(
    process.execPath,
    [
      "--experimental-vm-modules",
      "node_modules/jest/bin/jest.js",
      "--runInBand",
      ...process.argv.slice(2),
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "test",
        EMAIL_ENABLED: "false",
        ONESIGNAL_ENABLED: "false",
        DATABASE_URL: url,
        DIRECT_URL: url,
        JWT_ACCESS_SECRET: "isolated-test-secret-not-for-any-real-system-2026",
        REDIS_URL: `redis://127.0.0.1:${redisPort}`,
        LOG_LEVEL: process.env.TEST_LOG_LEVEL || "silent",
        BCRYPT_ROUNDS: "10",
        TEST_EMBEDDED: "true",
        RATE_LIMIT_MAX: "10000",
        LOGIN_RATE_LIMIT_MAX: "10000",
      },
    },
  );
  process.exitCode = await new Promise((r, j) => {
    child.once("exit", (code) => r(code ?? 1));
    child.once("error", j);
  });
} finally {
  await server.stop();
  await db.close();
  await redis.stop();
}
