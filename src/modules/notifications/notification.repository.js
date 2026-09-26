import { enqueueNotification } from "../../jobs/outbox.repository.js";
export const taskNotification = async (tx, task, type, title, key) => {
  const notification = await tx.notification.create({
    data: {
      userId: task.assigneeId,
      type,
      title,
      message: task.title,
      entityType: "Task",
      entityId: task.id,
      ...(key ? { dedupeKey: key } : {}),
    },
  });
  await enqueueNotification(tx, notification);
  return notification;
};
