import { createHmac } from "node:crypto";
import { env } from "../config/env.js";

// Do not use publicly visible user IDs as unverified Web SDK aliases.
export const pushExternalId = (userId, config = env) =>
  createHmac("sha256", config.ONESIGNAL_ID_SECRET)
    .update(`orbit-push:${userId}`)
    .digest("hex");

export function createPushSender(config = env, request = fetch) {
  return async (_notification, recipient, eventId) => {
    if (!config.ONESIGNAL_ENABLED) return "disabled";
    const response = await request(
      "https://api.onesignal.com/notifications?c=push",
      {
        method: "POST",
        headers: {
          Authorization: `Key ${config.ONESIGNAL_REST_API_KEY}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          app_id: config.ONESIGNAL_APP_ID,
          include_aliases: {
            external_id: [pushExternalId(recipient.id, config)],
          },
          target_channel: "push",
          // Generic lock-screen content: confidential task/comment text stays behind API auth.
          headings: { en: "Orbit Workforce" },
          contents: { en: "You have a new workspace notification." },
          url: new URL("/notifications", config.FRONTEND_URL).href,
          idempotency_key: eventId,
        }),
      },
    );
    if (!response.ok) {
      const error = Object.assign(new Error("OneSignal request failed"), {
        code: `ONESIGNAL_HTTP_${response.status}`,
        permanent:
          response.status >= 400 &&
          response.status < 500 &&
          ![408, 429].includes(response.status),
      });
      const retry = response.headers.get("retry-after");
      const delay = /^\d+$/.test(retry || "")
        ? Number(retry) * 1000
        : Date.parse(retry) - Date.now();
      if (Number.isFinite(delay) && delay > 0)
        error.retryAfterMs = Math.min(delay, 86400000);
      throw error;
    }
    const body = await response.json();
    // OneSignal can return HTTP 200 without creating a message.
    if (!body.id) return "no-subscribers";
    return "accepted";
  };
}
