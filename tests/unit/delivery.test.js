import { test, expect, jest } from "@jest/globals";
import { SMTPServer } from "smtp-server";
import nodemailer from "nodemailer";
import { randomUUID } from "node:crypto";
import { createEmailSender } from "../../src/integrations/email.js";
import {
  createPushSender,
  pushExternalId,
} from "../../src/integrations/onesignal.js";

const config = {
  EMAIL_ENABLED: true,
  EMAIL_FROM: "notifications@orbit.test",
  FRONTEND_URL: "https://orbit.test",
  ONESIGNAL_ENABLED: true,
  ONESIGNAL_APP_ID: randomUUID(),
  ONESIGNAL_REST_API_KEY: "test-api-key",
  ONESIGNAL_ID_SECRET: "test-only-separate-secret-more-than-32-characters",
};
const note = { title: "Task assigned", message: "Private task title" };
const user = { id: randomUUID(), email: "employee@orbit.test" };

test("Nodemailer sends a real SMTP message to an isolated local test server", async () => {
  let received = "";
  const smtp = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    onData(stream, _session, callback) {
      stream.on("data", (chunk) => {
        received += chunk;
      });
      stream.on("end", () => callback());
    },
  });
  await new Promise((resolve) => smtp.listen(0, "127.0.0.1", resolve));
  const transport = nodemailer.createTransport({
    host: "127.0.0.1",
    port: smtp.server.address().port,
    secure: false,
    ignoreTLS: true,
  });
  try {
    const eventId = randomUUID();
    expect(
      await createEmailSender(config, transport)(note, user, eventId),
    ).toBe("accepted");
    expect(received).toContain("To: employee@orbit.test");
    expect(received).toContain("Private task title");
    expect(received).toContain(eventId);
  } finally {
    transport.close();
    await new Promise((resolve) => smtp.close(resolve));
  }
});
test("OneSignal uses the right endpoint, alias, authorization, and stable idempotency key", async () => {
  const request = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ id: randomUUID() }) });
  const send = createPushSender(config, request),
    id = randomUUID();
  expect(await send(note, user, id)).toBe("accepted");
  await send(note, user, id);
  const [url, options] = request.mock.calls[0];
  expect(url).toBe("https://api.onesignal.com/notifications?c=push");
  expect(options.headers.Authorization).toBe("Key test-api-key");
  const body = JSON.parse(options.body);
  expect(body.include_aliases.external_id).toEqual([
    pushExternalId(user.id, config),
  ]);
  expect(body.target_channel).toBe("push");
  expect(body.idempotency_key).toBe(id);
  expect(JSON.parse(request.mock.calls[1][1].body).idempotency_key).toBe(id);
  expect(options.body).not.toContain(note.message);
});
test("OneSignal 200 without a message ID is not recorded as accepted", async () => {
  const send = createPushSender(config, async () => ({
    ok: true,
    json: async () => ({
      id: "",
      errors: ["All included players are not subscribed"],
    }),
  }));
  expect(await send(note, user, randomUUID())).toBe("no-subscribers");
});
test("provider rate limits preserve Retry-After; wrong keys fail permanently", async () => {
  const response = (status) => ({
    ok: false,
    status,
    headers: { get: () => "30" },
  });
  await expect(
    createPushSender(config, async () => response(429))(
      note,
      user,
      randomUUID(),
    ),
  ).rejects.toMatchObject({
    retryAfterMs: 30000,
    permanent: false,
    code: "ONESIGNAL_HTTP_429",
  });
  await expect(
    createPushSender(config, async () => response(401))(
      note,
      user,
      randomUUID(),
    ),
  ).rejects.toMatchObject({ permanent: true });
});
test("disabled providers make no network calls", async () => {
  const request = jest.fn();
  expect(
    await createPushSender({ ...config, ONESIGNAL_ENABLED: false }, request)(
      note,
      user,
      randomUUID(),
    ),
  ).toBe("disabled");
  expect(request).not.toHaveBeenCalled();
  expect(
    await createEmailSender({ ...config, EMAIL_ENABLED: false })(
      note,
      user,
      randomUUID(),
    ),
  ).toBe("disabled");
});
