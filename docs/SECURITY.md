# Security and operating decisions

## Authentication and browser use

Access JWTs are restricted to HS256 and checked for issuer, audience, expiry, active user, token version, and an unrevoked/unexpired database session. Passwords use bcrypt with a configurable cost (default 12); validation rejects passwords exceeding bcrypt's 72-byte input limit. Password hashes and refresh-token hashes are excluded from public user projections.

Refresh tokens are random 48-byte values stored only as SHA-256 hashes. Rotation uses an atomic claim and session-family reuse detection. A consumed token cannot create another valid session. Multiple browser tabs must coordinate refresh, otherwise concurrent consumption can intentionally invalidate the family. There is no public registration, password-reset email flow, MFA, or external identity-provider integration in this package.

Cookie-authenticated login, refresh and logout require `X-CSRF-Protection: 1`; any supplied Origin must match the allowlist. Requests with this custom header require browser preflight when cross-origin. Requests without Origin remain supported for non-browser API clients. This is a custom-header plus origin defense, not a per-session synchronizer-token scheme. CORS uses exact origins and credentials. Production must use HTTPS with `COOKIE_SECURE=true`; cross-site cookies also need `COOKIE_SAME_SITE=none` and are subject to browser cookie restrictions.

The frontend should keep access tokens in memory and clear cached user data on logout. HttpOnly protects refresh-cookie access from JavaScript; it does not prevent an XSS-compromised page from issuing authenticated requests. Continue normal output escaping and frontend CSP hygiene.

## Authorization and data validation

The server checks action roles and database resource scope. Managers are restricted by team ownership; Employees by task assignment. Filters are combined with, rather than substituted for, scope predicates. Strict Zod objects prevent clients from setting server-owned fields. Sorting uses allowlisted database fields, and normal application queries use Prisma parameterization.

User role/password/deactivation changes revoke existing sessions. Record mutations, version increments, audit entries, and related notifications use transactions. Task compare-and-swap versions protect against lost updates. Serializable mutation transactions use bounded retries for database serialization failures.

## Supabase database boundary

Use the private `workforce` schema in both database connection URLs. The migration enables RLS without client policies and revokes table access from Supabase `anon`/`authenticated` when present. Keep this schema out of Supabase's exposed Data API schemas. All application access should go through Express.

The initial setup assumes a trusted server connection capable of accessing its app tables, such as the migration/table owner. PostgreSQL table owners normally bypass RLS; RLS here blocks direct client-role access, while application middleware enforces per-user scopes. A non-owner runtime role will be denied by enabled RLS unless you deliberately provision an appropriate server-only policy and grants. Do not disable RLS or add broad browser policies just to fix a server connection error.

Before deploying, separate migration privileges from runtime privileges if your operating model supports it. The runtime needs table SELECT/INSERT/UPDATE for normal modules but only SELECT/INSERT on audit rows; grant required sequence/schema access and design server-only RLS policies for that role. This package does not auto-provision Supabase roles or mutate your project's Data API settings.

The audit trigger blocks UPDATE/DELETE by ordinary SQL operations. Database owners can alter/disable triggers, so this is application audit integrity, not an externally tamper-proof archive. No audit retention/purge or expired-session cleanup job is implemented; choose and implement your retention policy before long-term use. Keep revoked sessions through the refresh validity window so replay detection remains meaningful.

## Redis, rate limits, and logging

Use persistent Redis with `noeviction` for BullMQ, a private network or authenticated/TLS endpoint, and appropriate backups. Shared API and auth rate-limit counters use Redis. Redis failure can make readiness fail and requests unavailable; the app does not silently disable the configured external rate-limit store. Configure `TRUST_PROXY_HOPS` to match your actual proxy path, because a wrong value can undermine client-IP rate limits.

Pino logs request IDs and sanitized error codes. Authorization and cookies are redacted, and request bodies are not logged. Environment validation reports missing variable names rather than secret values. Audit events use selected metadata rather than password or token contents.

## Operational boundaries

The supplied Docker, Compose, and CI files are for your own execution. Configure secrets, TLS, origins, process supervision, database backups, Redis persistence, log retention, and dependency updates in your environment. No infrastructure was created and no credentials were connected here. Review `VERIFICATION.md` for tested behavior and limits.

## Version 1.1 delivery and live connections

Socket.IO uses the same JWT/session database checks as REST. Origins are checked for the WebSocket handshake, every incoming operation is rate limited per user through Redis, packet size is bounded, and task permissions are rechecked before comment signals are delivered. Connection expiry forces a refreshed handshake. The server accepts no client-selected user rooms or recipient IDs.

External deliveries are generated only from committed application events. OneSignal and SMTP credentials remain in the backend environment. Emails use plain text; push content is generic. Current OneSignal Web SDK identity verification does not support JWT enforcement. Private HMAC-derived aliases reduce guessing but do not prove ownership if leaked; never expose other users' aliases. Keep the derivation secret stable and separate from JWT signing. The app must unlink OneSignal on logout/account switch.

Outbox rows preserve only event references and safe diagnostic codes, not provider credentials. Requests to OneSignal use a fixed HTTPS origin, timeouts and an idempotency key. Email uses verified TLS with required STARTTLS or immediate TLS. No remote file or URL attachment access is enabled. SMTP acceptance and OneSignal API acceptance do not prove delivery to an inbox or device. Test provider errors are simulated; external services were not contacted with real keys.
