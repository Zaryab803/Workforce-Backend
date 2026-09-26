import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import net from "node:net";
import { logger } from "./logger.js";

let socketServer = null;
let pgliteDb = null;

function isPortInUse(port, host = "127.0.0.1") {
  return new Promise((res) => {
    const tester = net.createServer()
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

export async function ensureDbServer() {
  const port = 54321;
  const inUse = await isPortInUse(port);
  if (inUse) {
    logger.info({ port }, "Database socket server already running on port");
    return;
  }

  const dataDir = resolve("./data/pglite_db");
  mkdirSync(dataDir, { recursive: true });
  pgliteDb = await PGlite.create({ dataDir });
  const schema = "workforce";
  await pgliteDb.exec(`CREATE SCHEMA IF NOT EXISTS ${schema}; SET search_path TO ${schema};`);

  // Apply migrations if tables don't exist yet
  const migrationsDir = resolve("prisma/migrations");
  if (existsSync(migrationsDir)) {
    const migrations = readdirSync(migrationsDir).sort();
    for (const migration of migrations) {
      const file = `${migrationsDir}/${migration}/migration.sql`;
      if (existsSync(file)) {
        const sql = readFileSync(file, "utf8");
        try {
          await pgliteDb.exec(sql);
        } catch {
          // Table / type may already exist
        }
      }
    }
  }

  socketServer = new PGLiteSocketServer({ db: pgliteDb, port, host: "127.0.0.1" });
  await socketServer.start();
  logger.info({ port, schema }, "PGlite PostgreSQL wire server active and ready");
}

export async function stopDbServer() {
  if (socketServer) {
    await socketServer.stop();
    socketServer = null;
  }
  if (pgliteDb) {
    await pgliteDb.close();
    pgliteDb = null;
  }
}
