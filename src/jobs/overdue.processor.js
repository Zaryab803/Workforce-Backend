import { env } from "../config/env.js";
import { transaction } from "../utils/transaction.js";
import { enqueueNotification } from "./outbox.repository.js";
export const calendarDay = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: env.JOB_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
export async function processOverdue(db, queue, day = calendarDay()) {
  const cutoff = new Date(day + "T00:00:00Z");
  let cursor,
    queued = 0;
  for (;;) {
    const batch = await db.task.findMany({
      where: {
        deletedAt: null,
        dueDate: { lt: cutoff },
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        assignee: { isActive: true, deletedAt: null },
      },
      select: { id: true, assigneeId: true },
      orderBy: { id: "asc" },
      take: 250,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!batch.length) break;
    await queue.addBulk(
      batch.map((task) => ({
        name: "overdue-notification",
        data: { taskId: task.id, userId: task.assigneeId, day },
        opts: { jobId: `overdue-${day}-${task.id}-${task.assigneeId}` },
      })),
    );
    queued += batch.length;
    cursor = batch.at(-1).id;
  }
  return { queued, day };
}
export async function deliverOverdue(db, { taskId, userId, day }) {
  const task = await db.task.findFirst({
    where: {
      id: taskId,
      assigneeId: userId,
      deletedAt: null,
      dueDate: { lt: new Date(day + "T00:00:00Z") },
      status: { notIn: ["COMPLETED", "CANCELLED"] },
      assignee: { isActive: true, deletedAt: null },
    },
    select: { id: true, title: true },
  });
  if (!task) return { skipped: true };
  const dedupeKey = `overdue-${day}-${task.id}-${userId}`;
  return transaction(db, async (tx) => {
    const notice = await tx.notification.upsert({
      where: { dedupeKey },
      update: {},
      create: {
        dedupeKey,
        userId,
        type: "TASK_OVERDUE",
        title: "A task needs your attention",
        message: `${task.title} is overdue.`,
        entityType: "Task",
        entityId: task.id,
      },
    });
    await enqueueNotification(tx, notice);
    return { notificationId: notice.id };
  });
}
