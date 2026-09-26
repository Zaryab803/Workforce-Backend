import { randomUUID } from "node:crypto";
import { authenticateToken } from "../middleware/authenticate.js";
import { authorizeTask } from "../middleware/authorize.js";
import { createEmailSender } from "../integrations/email.js";
import { createPushSender } from "../integrations/onesignal.js";
import { logger } from "../config/logger.js";
export const liveChannel = "orbit:live:v1";

export function createOutboxDelivery(
  db,
  redis,
  { email = createEmailSender(), push = createPushSender() } = {},
) {
  return async (event) => {
    if (event.kind === "COMMENT_LIVE") {
      await redis.publish(
        liveChannel,
        JSON.stringify({
          kind: event.kind,
          ...event.payload,
          eventId: event.id,
        }),
      );
      return "published";
    }
    const notification = await db.notification.findUnique({
      where: { id: event.payload.notificationId },
      include: { user: { include: { role: true } } },
    });
    if (
      !notification ||
      !notification.user.isActive ||
      notification.user.deletedAt
    )
      return "ineligible";
    if (notification.entityType === "Task") {
      try {
        await authorizeTask(
          db,
          { id: notification.user.id, role: notification.user.role.name },
          notification.entityId,
        );
      } catch (error) {
        if ([403, 404].includes(error.status)) return "ineligible";
        throw error;
      }
    }
    if (event.kind === "NOTIFICATION_LIVE") {
      await redis.publish(
        liveChannel,
        JSON.stringify({
          kind: event.kind,
          notificationId: notification.id,
          userId: notification.userId,
          eventId: event.id,
        }),
      );
      return "published";
    }
    if (event.kind === "EMAIL")
      return email(notification, notification.user, event.id);
    if (event.kind === "PUSH")
      return push(notification, notification.user, event.id);
    throw Object.assign(new Error("Unknown delivery type"), {
      code: "UNKNOWN_EVENT",
      permanent: true,
    });
  };
}

// Conditional leases support multiple workers and recovery after process crashes.
export async function processOutbox(
  db,
  deliver,
  { now = new Date(), limit = 50, kinds } = {},
) {
  const eligible = {
    ...(kinds ? { kind: { in: kinds } } : {}),
    processedAt: null,
    failedAt: null,
    availableAt: { lte: now },
    OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
  };
  const rows = await db.outboxEvent.findMany({
    where: eligible,
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let processed = 0;
  for (const event of rows) {
    const lockToken = randomUUID();
    const lease = await db.outboxEvent.updateMany({
      where: { id: event.id, ...eligible },
      data: {
        lockToken,
        lockedUntil: new Date(Date.now() + 120000),
        attempts: { increment: 1 },
      },
    });
    if (!lease.count) continue;
    try {
      const result = await deliver(event);
      await db.outboxEvent.updateMany({
        where: { id: event.id, lockToken },
        data: {
          processedAt: new Date(),
          result,
          lockedUntil: null,
          lockToken: null,
          lastError: null,
        },
      });
      processed++;
    } catch (error) {
      const attempts = event.attempts + 1;
      const lastError = /^[A-Z0-9_]{1,60}$/.test(error.code || "")
        ? error.code
        : "DELIVERY_FAILED";
      await db.outboxEvent.updateMany({
        where: { id: event.id, lockToken },
        data: {
          lockedUntil: null,
          lockToken: null,
          lastError,
          failedAt: error.permanent || attempts >= 8 ? new Date() : null,
          availableAt: new Date(
            Date.now() +
              Math.max(
                error.retryAfterMs || 0,
                Math.min(3600000, 2000 * 2 ** attempts),
              ),
          ),
        },
      });
      logger.warn(
        { eventId: event.id, kind: event.kind, code: lastError, attempts },
        "Delivery failed; inspect outbox state",
      );
    }
  }
  return { processed };
}

// Used at fanout time as well as on connection, so revoked sessions cannot receive data.
export const currentSocketUser = (db, socket) =>
  authenticateToken(db, socket.data.token);
