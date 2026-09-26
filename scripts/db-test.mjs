import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

async function test() {
  const dataDir = resolve("./data/pglite_db");
  mkdirSync(dataDir, { recursive: true });
  console.log("Opening PGlite with dataDir:", dataDir);
  const db = await PGlite.create({ dataDir });
  const schema = "workforce";
  await db.exec(`CREATE SCHEMA IF NOT EXISTS ${schema}; SET search_path TO ${schema};`);
  console.log("Schema workforce ensured");

  const migrationsDir = resolve("prisma/migrations");
  if (existsSync(migrationsDir)) {
    const migrations = readdirSync(migrationsDir).sort();
    for (const migration of migrations) {
      const file = `${migrationsDir}/${migration}/migration.sql`;
      if (existsSync(file)) {
        console.log("Applying migration:", migration);
        const sql = readFileSync(file, "utf8");
        try {
          await db.exec(sql);
          console.log("Applied", migration);
        } catch (err) {
          console.log("Migration notice for", migration, ":", err.message);
        }
      }
    }
  }

  const server = new PGLiteSocketServer({ db, port: 54321, host: "127.0.0.1" });
  await server.start();
  console.log("PGLiteSocketServer started on 127.0.0.1:54321");

  await server.stop();
  await db.close();
  console.log("Closed test successfully");
}

test().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
