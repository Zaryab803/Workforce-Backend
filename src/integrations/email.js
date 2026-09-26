import nodemailer from "nodemailer";
import { env } from "../config/env.js";

export function createEmailSender(config = env, transport) {
  // Never connect to SMTP until a persisted delivery is processed.
  const mailer =
    transport ||
    (config.EMAIL_ENABLED
      ? nodemailer.createTransport({
          host: config.SMTP_HOST,
          port: config.SMTP_PORT,
          secure: config.SMTP_SECURE,
          requireTLS: !config.SMTP_SECURE,
          auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 20000,
          disableFileAccess: true,
          disableUrlAccess: true,
        })
      : null);
  return async (notification, recipient, eventId) => {
    if (!config.EMAIL_ENABLED) return "disabled";
    const url = new URL("/notifications", config.FRONTEND_URL).href;
    const result = await mailer.sendMail({
      from: config.EMAIL_FROM,
      to: recipient.email,
      subject: notification.title.replace(/[\r\n]/g, " "),
      text: `${notification.title}\n\n${notification.message}\n\nOpen your workspace: ${url}`,
      messageId: `<${eventId}@${config.EMAIL_FROM.split("@").at(-1)}>`,
    });
    if (!result.accepted?.length)
      throw Object.assign(new Error("SMTP rejected recipient"), {
        code: "SMTP_REJECTED",
      });
    return "accepted"; // SMTP acceptance is not proof of inbox delivery.
  };
}
