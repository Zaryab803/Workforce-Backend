import { enqueueNotification } from "../../jobs/outbox.repository.js";
import { authorizeTask } from "../../middleware/authorize.js";

export const taskNotification = async (tx, task, type, title, key, actorId) => {
  if (!task.assigneeId || task.assigneeId === actorId) return null;
  const recipient = await tx.user.findUnique({
    where: { id: task.assigneeId },
    select: {
      id: true,
      isActive: true,
      deletedAt: true,
      role: { select: { name: true } },
    },
  });
  if (!recipient?.isActive || recipient.deletedAt) return null;
  try {
    await authorizeTask(
      tx,
      { id: recipient.id, role: recipient.role.name },
      task.id,
    );
  } catch (error) {
    if ([403, 404].includes(error.status)) return null;
    throw error;
  }
  const notification = await tx.notification.create({
    data: {
      userId: recipient.id,
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
