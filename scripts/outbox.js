import { prisma } from "../src/config/prisma.js";
import { z } from "zod";
try {
  if (process.argv[2] === "retry") {
    const id = z.uuid().parse(process.argv[3]);
    // Keep OneSignal retries within its 30-day idempotency window.
    const result = await prisma.outboxEvent.updateMany({
      where: {
        id,
        failedAt: { not: null },
        processedAt: null,
        createdAt: { gt: new Date(Date.now() - 29 * 86400000) },
      },
      data: {
        failedAt: null,
        attempts: 0,
        availableAt: new Date(),
        lockedUntil: null,
        lockToken: null,
        lastError: null,
      },
    });
    console.log({ requeued: result.count });
  } else {
    console.table(
      await prisma.outboxEvent.findMany({
        where: { processedAt: null },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          kind: true,
          attempts: true,
          failedAt: true,
          availableAt: true,
          lastError: true,
        },
      }),
    );
  }
} finally {
  await prisma.$disconnect();
}
