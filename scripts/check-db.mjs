import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function check() {
  const task = await db.task.findFirst({
    where: { title: "Real-time Live Sync Verification Task" },
    include: { comments: true },
  });
  console.log("Database Persistence Check:");
  console.log("- Task in DB:", task?.id, "| status:", task?.status);
  console.log("- Comments count in DB:", task?.comments?.length);
  console.log("- Comment body:", task?.comments?.[0]?.comment);
  await db.$disconnect();
}

check().catch(console.error);
