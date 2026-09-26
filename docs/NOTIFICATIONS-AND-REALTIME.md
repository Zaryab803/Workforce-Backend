# Email, OneSignal and real-time comments

Version 1.1.0. These integrations contain working provider adapters and durable server logic. No external email/push message was sent and no deployment was performed. Real delivery requires your credentials, provider setup, reachable services and the frontend steps below.

## 1. What is used and where

| Feature                       | Code location                                                                                          | Benefit                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Email using Nodemailer SMTP   | `src/integrations/email.js`                                                                            | Works with an SMTP provider; requires TLS and uses plain-text messages to avoid HTML injection. |
| OneSignal Web Push            | `src/integrations/onesignal.js`                                                                        | Targets one user's browser subscriptions; stable idempotency keys make provider retries safer.  |
| Live comments and app updates | `src/realtime/server.js`                                                                               | Socket.IO delivers change events to authorized connected users.                                 |
| Durable delivery outbox       | `src/jobs/outbox.repository.js`, `src/jobs/outbox.processor.js`                                        | Saves delivery work atomically with the notification/comment; recovers after worker restarts.   |
| Scheduling and retries        | `src/workers/start-workers.js`, `src/jobs/queues.js`                                                           | Separate live and external-delivery queues prevent slow SMTP from blocking comment updates.     |
| OneSignal client identity     | `GET /api/v1/notifications/push-config`                                                                | Returns the authenticated user's opaque alias and the public App ID, never the API key.         |
| Database changes              | `prisma/migrations/202609250002_delivery_outbox/migration.sql`                                         | Adds outbox records and optional comment retry IDs without removing existing data.              |
| Frontend examples             | `examples/realtime-client.ts`, `examples/onesignal-client.ts`, `examples/public/OneSignalSDKWorker.js` | Shows connection, subscriptions, reconnection, consent and logout.                              |

## 2. Upgrade and run locally

Back up your development database before applying migrations. Copy the new environment entries from `.env.example` into your existing `.env`, preserving your current database URLs and JWT secret.

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run dev
```

Run the worker in a second terminal:

```bash
npm run worker:dev
```

Redis and PostgreSQL must be running. Existing database records are preserved by the additive migration. Old notification history is not bulk-emailed or pushed. External channels are scheduled for new notification events while their flag is enabled. In-app records and Socket.IO comments work with both external channels disabled.

## 3. Email configuration

```dotenv
EMAIL_ENABLED=true
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-provider-username
SMTP_PASS=your-smtp-password-or-app-password
EMAIL_FROM=notifications@your-verified-domain.com
FRONTEND_URL=http://localhost:3000
```

These are illustrative values, not credentials. Use the exact SMTP settings from your provider. For port 587, `SMTP_SECURE=false` still requires STARTTLS. For port 465, set `SMTP_SECURE=true`. The code does not disable certificate verification. Some providers require an app password or SMTP-specific credentials instead of your normal account password. Verify the sending domain/address with the provider and configure its required DNS records.

Emails go to the recipient's current database email address. Replace the fictional `@orbit.demo` seed addresses with mailboxes you control when testing real email. Messages include a notification title, task title and a link to the workspace. Provider acceptance is not proof that the email arrived in the inbox; spam filtering, bounces and mailbox restrictions remain provider concerns. There is no bounce webhook in this release.

After editing `.env`, restart BOTH API and worker. Placeholder or missing required credentials cause startup validation to fail when the relevant channel is enabled. Failed sends are recorded instead of being reported as successful.

## 4. OneSignal setup

1. Configure a OneSignal app for Web Push and your frontend origin.
2. Copy its App ID and App API key into the BACKEND `.env`. Generate a separate random secret using `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"` for `ONESIGNAL_ID_SECRET`.
3. Set `ONESIGNAL_ENABLED=true`. Keep the alias secret identical on API and worker; changing it changes all aliases.
4. Copy `examples/public/OneSignalSDKWorker.js` to your FRONTEND `public/OneSignalSDKWorker.js`. The resulting URL must serve JavaScript without authentication or an HTML redirect.
5. Load the Web SDK once in the frontend, then call `initializePush(sdk)` after your app's login/session restore. Use the returned `externalId` through the helper; do not substitute database user IDs.
6. Wire `enablePushFromClick(sdk)` to an explicit button after initialization. The user must grant browser permission and obtain a subscribed browser/device. Call `disconnectPush(sdk)` at logout/account switch.

```dotenv
ONESIGNAL_ENABLED=true
ONESIGNAL_APP_ID=your-real-app-uuid
ONESIGNAL_REST_API_KEY=your-real-app-api-key
ONESIGNAL_ID_SECRET=your-generated-separate-secret
```

Load the SDK using your framework's script component or this HTML:

```html
<script
  src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
  defer
></script>
```

Run the helper inside the SDK-ready callback:

```typescript
// Browser-only setup; initializePush is imported from the included example.
window.OneSignalDeferred = window.OneSignalDeferred || [];
window.OneSignalDeferred.push(async (sdk) => {
  await initializePush(sdk);
  // Enable your notification-consent button now; its click calls enablePushFromClick(sdk).
});
```

For TypeScript, type this window property in your application's global declarations as an array of callbacks accepting `OneSignalWeb` from the example. Mount initialization once per authenticated application session; account switches must run logout and login sequentially.

Use HTTPS for the real site. For local trials, configure a separate localhost OneSignal app and use `http://localhost:3000` consistently, not an interchangeable IP origin. Browser/platform support and permissions still apply. Correct backend keys alone cannot create a browser subscription.

The OneSignal identity-verification documentation currently states that its JWT verification is mobile-only. Do not enable that app-wide toggle for this Web SDK integration. This backend therefore issues a server-secret-derived, unguessable alias only to the authenticated owner. Treat it as private; it is not a substitute for provider-verified ownership if an alias leaks. Push content is deliberately generic and contains no task titles, comments or user IDs. Full details require the authenticated API.

An HTTP 200 response with no OneSignal message ID is recorded as `no-subscribers`, not `accepted`. Subscribe the browser first, then create a NEW task/comment event. Old no-subscriber messages are not replayed automatically.

## 5. Socket.IO frontend connection

Install the client in your FRONTEND project:

```bash
npm install socket.io-client
```

Copy `examples/frontend-client.ts` and `examples/realtime-client.ts` together. Configure:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
```

The API sample keeps access tokens in memory and coordinates refresh within one tab. Multi-tab refresh coordination remains an integration requirement. Do not place SMTP credentials, the OneSignal API key or the alias secret in `NEXT_PUBLIC_*` variables.

Use `connectLive` after login. Subscribe to the open task. Its callbacks should invalidate/refetch your TanStack Query or Zustand data:

```typescript
const live = await connectLive({
  onCommentsChanged: (taskId) => {
    void refetchComments(taskId);
  },
  onNotificationsChanged: () => {
    void refetchNotificationsAndUnreadCount();
  },
  onResync: () => {
    void refetchVisibleData();
  },
  onError: (error) => showError(error.message),
});
await live.subscribe(taskId);
const clientRequestId = crypto.randomUUID();
await live.createComment(taskId, "Ready for review", clientRequestId);
// On page cleanup or logout:
live.stop();
```

The `refetch*` and `showError` functions are your UI callbacks, not supplied application globals. Comment lists use `GET /tasks/:id/comments`; notifications use `GET /notifications` and `/notifications/unread-count`. Update these callbacks to your frontend's existing stores/queries.

| Direction        | Event                  | Payload / result                                                             |
| ---------------- | ---------------------- | ---------------------------------------------------------------------------- |
| Client to server | `task:subscribe`       | `{ taskId }`; checks current task access.                                    |
| Client to server | `task:unsubscribe`     | `{ taskId }`; removes the local subscription.                                |
| Client to server | `comment:create`       | `{ taskId, comment, clientRequestId? }`; saves and acknowledges the comment. |
| Server to client | `comment:created`      | `{ taskId, commentId, eventId }`; refetch the task's comments.               |
| Server to client | `notification:created` | `{ notificationId, eventId }`; refetch notifications and unread count.       |

Every incoming event needs an acknowledgement callback (or `emitWithAck`). Success is `{ ok: true, data }`; failure is `{ ok: false, error: { code, message } }`. Plain text comments are limited to 5,000 characters. The optional `clientRequestId` is a UUID scoped to the author: reusing it for the same text/task returns the saved comment without duplicate notifications. Reusing it for different text/task returns 409 / `COMMENT_REQUEST_CONFLICT`. Preserve it when retrying after an acknowledgement timeout. The same option works through the REST comment endpoint.

The handshake uses `auth: { token: accessToken }`. Current sessions and task permissions are checked again for incoming operations and outgoing comment signals. Expired tokens disconnect; the example refreshes and reconnects. Reconnects resubscribe and trigger REST refetches. Logout must stop the live client before revoking auth, and unlink OneSignal. Never put access tokens in socket query strings.

## 6. Recipient and delivery rules

- Task assignment, task edits and status changes notify the current assignee, following the existing task workflow.
- A comment notifies the task assignee and the owning team's manager, excluding its author and duplicate recipients. It broadcasts a comment-change signal to currently authorized clients subscribed to that task, including the author if subscribed.
- Overdue reminders notify the active assignee. The existing daily schedule is unchanged.
- Before external delivery, inactive users and recipients who no longer have access to the task are skipped.
- In-app history remains in PostgreSQL; email and push are extra channels for the same event.
- Mark-read calls currently require other tabs to refetch; `notification:created` is emitted for new records only.

Business data and delivery work commit in one PostgreSQL transaction. Separate workers drain live events and external deliveries every two seconds by default. Live updates are near-real-time and depend on a running worker. SMTP failures cannot hold up the live queue. Under backlog, latency may increase.

Each outbox row is leased before processing and records attempts, result, retry time and sanitized error code. Transient failures retry up to eight attempts with backoff. OneSignal 429 honors Retry-After. Non-retryable OneSignal 4xx errors fail for operator review. Email and push succeed/fail independently. Redis Pub/Sub is transient; disconnected clients recover from the database through REST. Consumers must tolerate duplicate change signals.

OneSignal uses the outbox UUID as its idempotency key. SMTP cannot guarantee exactly-once delivery: a worker crash after the provider accepts an email but before PostgreSQL records success can cause a duplicate on retry. A stable Message-ID helps correlation but does not guarantee deduplication.

## 7. Troubleshooting and verification

```bash
npm run outbox:status
# After fixing credentials/configuration, retry ONE failed event by ID:
npm run outbox:retry -- EVENT_UUID
```

The status command shows up to 50 pending/failed events without printing secrets or message text. Completed outcomes can be inspected in the `OutboxEvent` model using `npm run db:studio`. `accepted` means the provider accepted the request; `published` means Redis accepted the signal; `no-subscribers`, `disabled`, and `ineligible` are explicit skips. Enabling a channel later does not retroactively create deliveries for historical notifications. Turning a channel off suppresses pending sends when the worker restarts with the flag disabled.

The retry command only accepts failed, unprocessed events less than 29 days old. It preserves the OneSignal key. Do not reset older provider records manually and assume deduplication is still guaranteed. Completed/failed outbox rows are retained for inspection; add a retention policy appropriate to your organization as volume grows.

Test in this order: run migrations; start API, Redis and worker; log in as Manager and Employee in separate browsers; subscribe both to a task; add a comment; verify live refresh and in-app history. Then enable your SMTP settings with a mailbox you own. Finally subscribe that browser to OneSignal and trigger another new event. Check database delivery outcomes and your provider dashboards if nothing arrives.

The automated tests use a local SMTP server, real Socket.IO clients, an isolated database, real Redis, and a simulated OneSignal HTTP adapter. External SMTP authentication, email inbox arrival, real OneSignal delivery and frontend browser subscription have not been tested with your credentials.

## Official references checked

- https://nodemailer.com/smtp
- https://documentation.onesignal.com/reference/push-notification
- https://documentation.onesignal.com/docs/en/web-sdk-reference
- https://documentation.onesignal.com/docs/en/identity-verification
- https://socket.io/docs/v4/middlewares/
- https://socket.io/docs/v4/server-socket-instance/
