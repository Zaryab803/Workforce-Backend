import { paginate } from "../../utils/pagination.js";
import { assert } from "../../utils/errors.js";

const serializeNotification = (n) => ({
  ...n,
  body: n.message,
  message: n.message,
  read: n.isRead,
  isRead: n.isRead,
  taskId: n.entityId || "",
  entityId: n.entityId || "",
  createdAt: n.createdAt ? new Date(n.createdAt).toISOString() : "",
});

export function notificationService(db) {
  return {
    async list(user, q) {
      const page = await paginate(
        db,
        "notification",
        {
          userId: user.id,
          ...(q.isRead !== undefined ? { isRead: q.isRead } : {}),
        },
        q,
      );
      return {
        ...page,
        data: (page.data || []).map(serializeNotification),
      };
    },
    async read(user, id) {
      const changed = await db.notification.updateMany({
        where: { id, userId: user.id },
        data: { isRead: true, readAt: new Date() },
      });
      assert(
        changed.count,
        404,
        "NOTIFICATION_NOT_FOUND",
        "Notification was not found.",
      );
      return { markedRead: true, success: true };
    },
    async readAll(user) {
      const changed = await db.notification.updateMany({
        where: { userId: user.id, isRead: false },
        data: { isRead: true, readAt: new Date() },
      });
      return { markedRead: changed.count, success: true };
    },
    async unread(user) {
      return {
        unread: await db.notification.count({
          where: { userId: user.id, isRead: false },
        }),
      };
    },
  };
}
