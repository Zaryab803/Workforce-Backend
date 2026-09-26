import { env } from "../config/env.js";

export const enqueueEvent = (tx, kind, key, payload) =>
  tx.outboxEvent.upsert({
    where: { key },
    update: {},
    create: { key, kind, payload },
  });

export async function enqueueNotification(tx, notification, config = env) {
  const payload = { notificationId: notification.id };
  await enqueueEvent(
    tx,
    "NOTIFICATION_LIVE",
    `live-${notification.id}`,
    payload,
  );
  if (config.EMAIL_ENABLED)
    await enqueueEvent(tx, "EMAIL", `email-${notification.id}`, payload);
  if (config.ONESIGNAL_ENABLED)
    await enqueueEvent(tx, "PUSH", `push-${notification.id}`, payload);
}
