# OneSignal integration handoff — updated 7 October 2026

Implemented locally; nothing was deployed and no real push request was sent. On 7 October, the user explicitly approved the additive database change: `workforce.users.push_enabled` was applied and independently verified, with all 10 existing users unchanged. Prisma history reconciliation remains pending; see [PRISMA-RELEASE.md](PRISMA-RELEASE.md). OneSignal push remains disabled pending the localhost test app setup and browser opt-in. The local background notification worker was started for in-app live delivery. The frontend uses only the Web SDK v16 script integration, with a provider mounted once in the existing root Providers component.

## Complete flow

1. Existing session restoration and `/auth/me` or successful login confirm application authentication. The client obtains `/notifications/push-config` with the application's Bearer token. It contains the public App ID, this user's opaque external ID, and account push preference; it never contains a provider secret.
2. A window-scoped promise initializes the SDK once, including React development remounts and navigation. Permission is never requested during initialization. The app uses `public/onesignal/OneSignalSDKWorker.js` with scope `/onesignal/`; no previous service worker or registration was found.
3. The SDK opts out and logs out the previous browser identity before calling `login(externalId)`. Identity operations are serialized, stale configuration responses are ignored, and pending permission prompts cannot remap an account after logout. Confirmed authentication responses are guarded against concurrent login/logout changes.
4. Notifications → Enable push notifications requests native permission from the click handler. After permission is granted, the authenticated preference endpoint saves `pushEnabled=true`, then the browser opts in. Disable saves false and opts out. Preferences are account-wide; browser permission and subscription status remain device-specific. Existing users default to false through the migration.
5. Task/comment services use the existing transaction helper. They write an in-app Notification and unique durable events in the same transaction. Email and push events are queued only when their channel is enabled. Socket.IO remains the realtime transport and Nodemailer remains the email transport.
6. After commit, BullMQ's existing outbox worker loads the notification and recipient, rechecks active status and actual task access, and checks the stored push preference. The sender targets exactly one opaque external ID through `include_aliases.external_id` and `target_channel="push"`; it never uses segments or broadcasts.
7. The REST sender sends only a generic heading and message. It links to `/notifications`; authenticated in-app links use the existing `/tasks/[id]` page, whose API calls use `authorizeTask`. Push content contains no task title, comment text, email, employee information, or private entity data.
8. The existing outbox stores `accepted`, `no-subscribers`, `disabled`, `preference-disabled`, or `ineligible`. `accepted` means API acceptance, not confirmed delivery or device display. No confirmed-delivery metric is fabricated.

Opaque IDs reuse the existing `HMAC-SHA256(ONESIGNAL_ID_SECRET, "orbit-push:" + databaseUserId)` mapping. API and worker must share the same stable secret. Neither an email nor a role is the recipient identity. The HMAC reduces guessability but is not identity verification: client-visible aliases do not prove authentication. OneSignal currently documents that Identity Verification does not support Web SDK and its app-wide toggle breaks Web login. Leave it off. [OneSignal identity verification](https://documentation.onesignal.com/docs/en/identity-verification)

## Recipient rules

| Event | Recipients |
| --- | --- |
| Successful password login | Only the authenticated user. One unread `LOGIN` notice and durable live/push events are committed with that login's refresh session. Title: `Login successful`; message: `You have signed in successfully.` Email is not queued for this notice. Failed logins and token refreshes do not create notices. |
| Task assigned | Current assignee, excluding the actor. |
| Task edited or reassigned | Current/new assignee, excluding the actor. The old assignee is not notified because employee task access ends on reassignment. |
| Comment | Current assignee and task's team manager; deduplicated and actor excluded. |
| Status changed | Current assignee and task's team manager; deduplicated and actor excluded. Employee status changes therefore alert the manager. |
| Overdue | Active current assignee, once per task/assignee/calendar day using the existing scheduler timezone and dedupe key. No human actor applies. |

Recipients must be active, undeleted users whose role still permits access to the task. Worker delivery rechecks eligibility. The existing comment schema/UI has no structured mentions field; text containing `@name` does not add recipients. Structured mention support was not invented as a second notification system.

Login notices have `entityType=User` and no task link in the notification page or bell dropdown. Login push uses the same fixed success wording, one opaque recipient alias and durable idempotency key. Task/comment pushes retain generic workspace wording. All desktop push, including login, requires the saved account preference and a subscribed browser with notification permission. The first login cannot create a desktop alert before the user has granted permission and opted in.

For live/email delivery, the worker now selects only the user fields required by those channels. This allowed in-app delivery before the optional push column was applied. A live local test verified login HTTP 200, the unread success notice in the notifications API, the matching `notification:created` Socket.IO event and successful logout. The worker was started in the background as PID 8928; its logs are under ignored `node_modules/.cache/notification-worker/`. Do not launch an additional worker just to repeat this test.

Inspection and integration tests exposed two existing access issues. Assignment now requires an existing membership or management of the project's team and does not silently enroll an employee in an arbitrary team. Socket.IO fanout rechecks sessions and task access before sending comments/task updates, including when team management has changed.

## Reliability and configuration

The REST request has a 15-second timeout. The existing outbox retries transient errors with exponential backoff, at most eight attempts, with ordinary backoff capped at one hour. Provider Retry-After is respected with a 24-hour cap. HTTP 408, 429 and 5xx remain retriable. Other 4xx, including invalid credentials, become permanent failures visible in the outbox. The durable PUSH event UUID is reused as `idempotency_key` on every attempt. Missing subscriptions are an explicit completed outcome; unexpected successful HTTP responses without a message ID become `ONESIGNAL_REJECTED`. Provider failures cannot undo the already committed task or in-app notification. Logs retain only event ID, kind, attempt and sanitized error code, not API credentials or provider response text.

Local examples and local configuration use:

```dotenv
# Frontend only
NEXT_PUBLIC_ONESIGNAL_APP_ID=edd7b5b3-0d24-4927-9025-d360f655514e

# Express API and notification worker
ONESIGNAL_ENABLED=false
ONESIGNAL_APP_ID=edd7b5b3-0d24-4927-9025-d360f655514e
ONESIGNAL_REST_API_KEY=
# Generate a separate 32+ character secret before enabling push, then retain it.
ONESIGNAL_ID_SECRET=
```

The user-supplied App API key is stored only in the ignored local backend `.env`. A read-only authenticated OneSignal messages request returned HTTP 200, confirming the key works for app `edd7b5b3-0d24-4927-9025-d360f655514e`. A read-only app request confirmed its Chrome/Safari origin is `https://workforce-frontend.vercel.app`. No push was sent. A separate random 64-character local identity secret has now been generated and saved without printing it. Current environment validation and API health/readiness pass with push disabled; no production variables were changed.

For the requested localhost test, use a separate OneSignal app with Site URL `http://localhost:3000`, matching backend/frontend App IDs and that test app's server API key. Set frontend `NEXT_PUBLIC_ONESIGNAL_ALLOW_LOCALHOST=true`; the SDK applies it only on `localhost` or `127.0.0.1`. Restart the frontend after changing public environment variables. The current production app's origin was not changed. The local test App ID/key and a connected Chrome/Edge session are still required for a real device test. [OneSignal localhost testing](https://documentation.onesignal.com/docs/en/web-push-custom-code-setup#local-testing)

The API and worker share the existing environment validation. Enabling push requires a valid UUID, a non-placeholder App API key, and a separate 32+ character ID secret. Keep the ID secret stable. Changing it changes all external IDs and requires browser remapping. REST keys and ID secrets belong only in server secret storage, never in frontend variables or committed dotenv files.

## Exact dashboard steps for a future release

These are handoff instructions; no dashboard settings, deployment, database release migration, or production environment was changed.

**OneSignal**

1. Open app `edd7b5b3-0d24-4927-9025-d360f655514e`. Go to Settings → Push & In-App → Web; choose Custom Code.
2. Set Site Name to Orbit Workforce and Site URL to `https://workforce-frontend.vercel.app` exactly. Keep Auto Resubscribe off for this explicit preference flow. A default icon is optional.
3. Keep Identity Verification off. Do not add another React SDK, script snippet, tag-manager integration, or automatic prompt. The application owns initialization and its settings button.
4. The code specifies `serviceWorkerPath="onesignal/OneSignalSDKWorker.js"` and scope `/onesignal/`. Custom Code uses these code options rather than dashboard worker-path fields.
5. Under Settings → Keys & IDs, obtain the App API key for this app, not an organization API key. Put it only into the Express and worker secrets described below.
6. Later, check Audience → Users & subscriptions → Subscriptions for the designated employee browser. Mark only the designated testing subscription as a test user using its options menu.

The exact site and worker setup follows [OneSignal Custom Code setup](https://documentation.onesignal.com/docs/en/web-push-custom-code-setup) and [service worker requirements](https://documentation.onesignal.com/docs/en/onesignal-service-worker).

**Vercel frontend**

1. Open the Workforce frontend project → Settings → Environment Variables → Add Environment Variable.
2. For Production, set `NEXT_PUBLIC_ONESIGNAL_APP_ID` to the App ID above. Keep the existing `NEXT_PUBLIC_API_URL` pointed at the versioned Express API (`https://<existing-api-domain>/api/v1`). No backend domain was guessed or changed.
3. Never add `ONESIGNAL_REST_API_KEY` or `ONESIGNAL_ID_SECRET` to the frontend project. For preview/development on a different origin, use a separate OneSignal app and matching backend configuration, or leave push disabled.
4. Public Next.js variables require a new frontend build/redeployment to take effect. During a later authorized release, verify the worker URL below returns HTTP 200, JavaScript content type, and its importScripts line without redirects or authentication. Deployment protection must not intercept this file for the public production site.

[Vercel environment configuration](https://vercel.com/academy/vercel-foundations/vercel-settings)

**Railway API and worker**

1. Select the existing project and correct environment. Open the Express service → Variables and the existing notification-worker service → Variables. Add the same `ONESIGNAL_APP_ID`, `ONESIGNAL_ENABLED=false`, and an initially blank `ONESIGNAL_REST_API_KEY` to both. Retain existing DATABASE_URL and REDIS_URL wiring.
2. Set `FRONTEND_URL=https://workforce-frontend.vercel.app` in both. Ensure the API's existing `CORS_ORIGINS` includes that exact origin.
3. Generate one separate random 32+ character `ONESIGNAL_ID_SECRET` in a secure environment and put the identical value into both services. Store the valid App API key server-side in both. Railway shared variables referenced by both services can keep the values consistent.
4. The API keeps its existing start command; the worker runs `npm run worker`. It needs the same database/Redis and provider configuration as the API. Check outbox status with `npm run outbox:status`; provider acceptance appears in the persisted event result.
5. Follow [PRISMA-RELEASE.md](PRISMA-RELEASE.md) before a future release. Local generation now succeeds, but the configured existing Supabase database has no Prisma migration history and has schema differences. Review and establish its baseline before using `npm run db:migrate` (`prisma migrate deploy`). Once only the push migration is pending, apply it before starting this version. It adds `users.push_enabled` with default false and has not been applied to the existing database.
6. Only after credentials, dashboard, migration and worker setup are ready, change `ONESIGNAL_ENABLED=true` in both services. Railway variable changes are staged and need review/deployment to apply. Reload the browser after activation. No activation or deployment was performed in this task.

[Railway Variables](https://docs.railway.com/variables)

**Real-device acceptance test still required**

Use only a designated test manager and employee. With the employee signed in on the configured origin, choose Enable push notifications and Allow. Confirm the dashboard subscription has the opaque external ID returned by that employee's authenticated push-config. As the test manager, assign an accessible task to the test employee. Confirm one in-app notification, an accepted PUSH outbox event targeting only that employee alias, and a visible generic device notification. Click it and verify login and task access enforcement. Repeat logout/account switching and denied browser permission; ensure the old account is detached. A provider-accepted event alone does not satisfy device-display verification.

## Changed files

Frontend repository:

- `.env.example` and ignored `.env.local`: public App ID.
- `src/app/providers.tsx`: root-mounted push provider.
- `src/features/notifications/notifications.tsx`: existing notifications page settings control.
- `src/features/notifications/push-settings.tsx`: initialization provider and accessible permission/status UI.
- `src/lib/push.ts`: one script loader and browser runtime.
- `src/lib/push-controller.ts`: serialized identity/permission state machine.
- `src/lib/api/auth.api.ts`: confirmed identity changes and logout.
- `src/lib/api/client.ts`: detach identity when access token is cleared.
- `public/onesignal/OneSignalSDKWorker.js`: isolated-scope worker.
- `tests/push.test.ts`: mocked lifecycle/race tests.
- `tests/e2e/push.spec.ts` and `playwright.push.config.ts`: isolated mocked browser verification and worker HTTP checks.

Backend repository:

- `.env.example` and ignored `.env`: App ID and disabled configuration.
- `prisma/schema.prisma` and `prisma/migrations/202610060001_push_preferences/migration.sql`: persisted opt-in preference.
- `src/integrations/onesignal.js`: clarify opaque alias limitations and provider rejection outcomes.
- `src/jobs/outbox.processor.js`: preference check before push delivery.
- `src/modules/notifications/notification.repository.js`: active recipient/access/actor filtering.
- `src/modules/notifications/notification.route.js` and `notification.schema.js`: authenticated configuration and preference endpoint.
- `src/modules/tasks/task.service.js`: actor exclusion, manager status recipients, valid team assignment.
- `src/realtime/server.js`: recheck session/task access at fanout.
- `src/docs/openapi.js` and `openapi.json`: preference API documentation.
- `scripts/test-embedded.mjs`: Windows Redis path quoting and stdout readiness fixes using the existing cached binary.
- `tests/integration/api.test.js` and `tests/unit/delivery.test.js`: assignment/targeting/retries/preferences/access and provider outcomes.
- `docs/ONESIGNAL.md`: this handoff.

Pre-existing backend package.json/package-lock.json changes were preserved. No new SDK dependency or parallel notification pipeline was added.

## Verification status

- The reported local login HTTP 500 was confirmed as Prisma P2022 for the then-missing `users.push_enabled` column. Login, refresh and access-token authentication now select only their required fields, allowing normal authentication before the optional push migration is released. Actual local login, `/auth/me`, disabled push configuration and unread-count requests returned HTTP 200 against the existing database; an authenticated WebSocket connected, and the test session was logged out. Invalid credentials return HTTP 401. The column was subsequently applied with explicit user approval on 7 October; no reset was performed.
- An existing hardcoded demo-password bypass was removed; login now verifies the account's bcrypt hash. Three regression cases confirm those demo passwords cannot log into an account with a different password hash.
- Realtime now waits for an access token, connects on login/restoration, disconnects on logout and removes its token listener on unmount. Three new frontend tests cover this lifecycle.
- Frontend Vitest: 21 tests passed, including authenticated realtime lifecycle, grant/deny, failure/unsupported/disabled states, initialization reuse, logout/account switching and in-flight configuration/permission races. A timed-out identity operation blocks further remapping until reload and cleans up late completion.
- Backend isolated PostgreSQL-WASM + real Redis harness: all 78 tests passed across four suites, including 48 integration tests and 30 unit tests. The new login cases verify one self notice, live/push queueing, no login email, no failed-login/refresh notice, correct fixed push wording and one targeted alias. Provider HTTP is mocked; SMTP, Socket.IO and BullMQ use the existing local harness. Windows test Redis readiness now uses a bounded PING check when Memurai omits its readiness log under redirected output.
- Backend syntax check, ESLint and OpenAPI validation passed (41 operations).
- Frontend typecheck passed after the login notification changes; the earlier integration production build also passed. All 3 mocked Chrome tests passed: enabling/disabling, no automatic prompt, one initialization across navigation, denied permission, public worker HTTP validation and rendering a login notice without a task link. These are simulated provider tests, separate from the pending real device acceptance test.
- Public worker HTTP 200 and JavaScript content type were verified locally without credentials or redirects. The production worker URL remains unverified because no deployment was requested.
- The Windows EPERM issue was resolved by identifying the exact API process holding the Prisma DLL, temporarily stopping its watcher and child, and repeating `npm run db:generate` successfully with Prisma Client 6.19.0. The API was restored and health/readiness checks passed. Initial Supabase verification found the push column absent, no migration history, and existing schema differences. The approved single-column change has now been applied; migration history is still unresolved. No database reset occurred. See [PRISMA-RELEASE.md](PRISMA-RELEASE.md).
- Real subscriptions, delivery, production dashboard settings, device display and the designated-user end-to-end test remain unverified. Push stays disabled until valid server credentials and release configuration are provided.
