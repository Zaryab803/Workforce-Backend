# Verification record

Date: 25 September 2026. No deployment or external database connection was performed.

## Checks executed

| Check                                                        | Result                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `npm run test:embedded`                                      | **63 tests passed, 3 suites**: unit and integration              |
| `npm run lint`                                               | Passed                                                           |
| `npm run check`                                              | All checked JavaScript syntax passed                             |
| `npm run docs:check`                                         | OpenAPI valid; **40 operations** exported to JSON                |
| `npx prisma validate` with local placeholder connection URLs | Schema valid                                                     |
| Both SQL migrations applied to the disposable test database  | Passed, including constraints, RLS statements, and audit trigger |
| Technology PDF                                               | Rendered and visually inspected                                  |

The test run used Node.js 24.19, the locked Prisma client, PGlite PostgreSQL-WASM, and a real disposable Redis 8.10.2 process. The source supports Node 22+; the supplied CI configuration targets Node 22, native PostgreSQL 16 and Redis 7, but that remote workflow has not been executed here.

## Behavior covered

- Invalid request data, unknown fields, invalid dates, password byte limits, task-version input, and status transition rules.
- Password verification, refresh-token hashing, JWT expiry, privacy of login responses, missing tokens, invalid credentials, CSRF headers, and CORS rejection.
- Refresh rotation, reuse detection revoking the session family, and logout invalidating the session.
- Employee and Manager task scope, cross-team assignment rejection, role-gated mutations, scoped list queries, and pagination.
- Version-conflict responses, simultaneous HTTP task writes, status history, review/completion permissions, comments, work hours, and soft deletion.
- Admin user/team operations, project scope, notification ownership, scoped dashboard/report access, and deactivation invalidating existing sessions.
- Audit API access, database rejection of audit tampering, and an injected audit-insert failure rolling back the preceding task update.
- A real Redis queue processing overdue work, idempotent notification delivery, and retry after a transient job failure.

## Limits of this verification

The embedded socket adapter uses one shared Prisma client connection and serializes database execution. Simultaneous HTTP requests exercise stale-version behavior, but database work is serialized by the adapter. These results do **not** validate native PostgreSQL multi-connection MVCC, deadlock behavior, or Supabase pooler behavior. The native-service CI workflow and local Docker infrastructure are included so you can verify those in your own environment.

Supabase connectivity, actual credentials, provider TLS, browser cross-site cookie behavior, real OneSignal delivery, external SMTP credentials/inbox delivery, browser push subscription, the previous frontend's integration, multi-tab refresh coordination, container image build, remote CI, load capacity, long-running scheduler reliability, and deployment were not verified. No claim of a security audit, exhaustive coverage, or production load readiness is made.

The earlier frontend remains a separate demo artifact. This package includes an adapter example and a field/endpoint mapping guide; it has not rewired that frontend. Use `FRONTEND-INTEGRATION.md` before connecting the applications.

## Reproduce

For the disposable local test: `npm ci`, `npm run db:generate`, then `npm run test:embedded`. The Redis test helper may build/download a binary; use `REDISMS_SYSTEM_BINARY` to supply an installed Redis executable. For a native database run, follow the test-schema setup in `README.md` and run `npm test`. Only disposable localhost schemas ending in `_test` are accepted by the integration suite.

## Version 1.1 delivery checks

- Nodemailer delivered an actual message to an isolated local SMTP server. Test-only transport disables TLS for that local fixture; production SMTP requires verified TLS.
- OneSignal request shape, private alias targeting, API-key header, stable idempotency key, no-subscriber outcomes, non-retryable errors and rate-limit backoff were tested with a simulated HTTP adapter. No message was sent through the real OneSignal service.
- Real Socket.IO clients verified authenticated connections, rejected cross-team subscriptions/comments, REST and socket comment broadcasts, notification recipient filtering and revoked-session rejection.
- Task scope was changed after subscription to verify that outgoing comment signals recheck current permissions.
- Comment retry IDs returned the same saved comment and rejected changed content.
- PostgreSQL rollback removed pending deliveries; independent channel creation, lease recovery, retry state and permanent failures were checked.
- The worker runtime used by the entrypoint and its BullMQ scheduler drained a committed live event through Redis.

The TypeScript frontend examples passed strict TypeScript checking with Node and DOM types. They are integration adapters, not a rewired or browser-tested frontend. The new PDF was rendered for layout review. External provider accounts, true credentials, browser/device delivery, proxy WebSocket upgrades and production concurrency/load still require verification in your own environment.

A separate worker-process trial against PGlite failed because its shared backend could not support the independent Prisma clients. The scheduler test therefore runs the same `startWorkers` runtime with the existing Prisma client. Native PostgreSQL API/worker processes remain an environment-specific check; the container CI definition is provided.
