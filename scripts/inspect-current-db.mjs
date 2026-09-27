import { prisma } from "../src/config/prisma.js";

async function main() {
  try {
    const info = await prisma.$queryRawUnsafe(`
      SELECT 
        current_database() as db, 
        current_schema() as current_schema, 
        current_setting('search_path') as search_path
    `);
    console.log("DB Connection Info:", info);

    const schemas = await prisma.$queryRawUnsafe(`
      SELECT schema_name 
      FROM information_schema.schemata 
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
    `);
    console.log("Available Schemas:", schemas);

    const tables = await prisma.$queryRawUnsafe(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_schema IN ('public', 'workforce')
      ORDER BY table_schema, table_name
    `);
    console.log("Tables in public & workforce:", tables);

    const userCount = await prisma.user.count();
    console.log("User count via Prisma:", userCount);
  } catch (err) {
    console.error("Query Error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
