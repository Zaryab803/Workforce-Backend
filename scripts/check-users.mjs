import { ensureDbServer, stopDbServer } from "../src/config/db-server.js";
import { prisma } from "../src/config/prisma.js";
import bcrypt from "bcrypt";

async function showUsers() {
  await ensureDbServer();
  await prisma.$connect();

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: { select: { name: true } },
      passwordHash: true,
    },
  });

  console.log("=== USERS IN DATABASE ===");
  for (const u of users) {
    const isAdmin123 = await bcrypt.compare("admin123", u.passwordHash);
    const isDemo123 = await bcrypt.compare("Demo123!", u.passwordHash);
    const isOrbit2026 = await bcrypt.compare("OrbitDemo2026!", u.passwordHash);
    let matchedPass = "Unknown";
    if (isAdmin123) matchedPass = "admin123";
    else if (isDemo123) matchedPass = "Demo123!";
    else if (isOrbit2026) matchedPass = "OrbitDemo2026!";

    console.log(`- Role: [${u.role.name.padEnd(8)}] Email: ${u.email.padEnd(25)} Name: ${u.name.padEnd(16)} Password: ${matchedPass}`);
  }
  await prisma.$disconnect();
  await stopDbServer();
}

showUsers().catch(console.error);
