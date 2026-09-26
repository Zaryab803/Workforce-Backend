import "../src/config/env.js";
import { PrismaClient } from "@prisma/client";
import { authService } from "../src/modules/auth/auth.service.js";

const db = new PrismaClient();
try {
  const s = authService(db);
  const res = await s.login(
    { email: "admin@workforce.com", password: "admin123" },
    { ip: "127.0.0.1", userAgent: "test" }
  );
  console.log("Login success! User:", res.user.email);
} catch (err) {
  console.error("Direct Login error:", err);
} finally {
  await db.$disconnect();
}
