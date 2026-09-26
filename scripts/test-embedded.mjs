// A disposable PostgreSQL-WASM + real Redis harness; never touches Supabase.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { RedisMemoryServer } from "redis-memory-server";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
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
const redis = new RedisMemoryServer({
  autoStart: false,
  binary: process.env.REDISMS_SYSTEM_BINARY
    ? { systemBinary: process.env.REDISMS_SYSTEM_BINARY }
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
