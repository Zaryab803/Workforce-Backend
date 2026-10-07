# Prisma recovery and database release — updated 7 October 2026

## Local generation recovered

The process holding `node_modules/.prisma/client/query_engine-windows.dll.node` was Node PID **6268**, running `src/server.js`. Its parent was PID **6732**, running the existing `node --watch --watch-path=.env src/server.js` development command. After verifying that exact module and process relationship, only this API watcher and its child were stopped.

`npm run db:generate` then completed successfully with Prisma Client **6.19.0** (exit code 0). The same development API command was restarted in the background. After the connection configuration changes, `/health` returned `{"status":"ok"}` and `/ready` returned `{"status":"ready"}`. During that initial recovery, no database reset, schema change, baseline, or migration was executed; the separately approved 7 October column change is recorded below.

The API loads this DLL again during normal operation. For future regeneration on Windows, stop this API watcher and any worker actually holding the same DLL before generating, then restart them. Do not kill unrelated Node processes.

## Verified configured Supabase target

Connection metadata and authenticated read-only SQL confirmed:

| Field | Verified value |
| --- | --- |
| Project reference | `tuewzpjqpnwkdmmnfhvu` |
| Database | `postgres` |
| Application schema | `workforce` |
| Working session endpoint | `aws-0-ap-southeast-1.pooler.supabase.com:5432` |
| Direct endpoint for the same project | `db.tuewzpjqpnwkdmmnfhvu.supabase.co:5432` |

The original local `DIRECT_URL` had an extra trailing slash in `/postgres/`. The direct endpoint was still unreachable from this machine after correcting that path. The ignored local `.env` now uses the already working session connection for `DIRECT_URL`, with the same credentials, database and `schema=workforce`. `DATABASE_URL` was preserved. Production/Railway secrets were not inspected or changed.

Supabase documents its port 5432 session pooler for Prisma migrations, including when a direct connection is unavailable: [Supabase Prisma connection guide](https://supabase.com/docs/guides/database/prisma). Do not substitute the port 6543 transaction endpoint for this migration connection.

## Approved push column applied — 7 October 2026

The user explicitly authorized adding the column to the existing users table if missing. The guarded script `.tmp/prisma-release-audit/apply-push-column.mjs` applied the exact SQL from `202610060001_push_preferences/migration.sql` to the verified Supabase project `tuewzpjqpnwkdmmnfhvu`, database `postgres`, schema `workforce`. It checks existing columns before writing and validates any existing definition. The first attempt expired with Prisma P2028 and a subsequent independent read confirmed no column had been added. The successful retry established the connection before starting the bounded 30-second transaction, retaining a 3-second lock timeout and adding a 5-second statement timeout.

The committed column is `boolean`, `NOT NULL`, default `false`. The transaction compared the count and checksum of existing user fields before and after: all 10 users and their existing data were unchanged. A separate read-only query confirmed the persisted column and user count. Local API health and readiness both returned HTTP 200. The ignored execution receipt is `.tmp/prisma-release-audit/push-column-release.json`. No reset, historical schema reconciliation, migration-history change, or `prisma migrate deploy` was performed. The earlier automatic approval rejection was superseded by explicit user authorization for this single-column change.

## Prisma migration history remains unresolved

Initial read-only inspection found 13 existing application tables and the push column absent. No `_prisma_migrations` table was found in any database schema. Before the approved column change, `prisma migrate status --schema=prisma/schema.prisma` connected successfully and exited 1, reporting all three repository migrations as pending:

1. `202609250001_initial`
2. `202609250002_delivery_outbox`
3. `202610060001_push_preferences`

The database has existing delivery columns, including `task_comments.client_request_id` and `notifications.dedupe_key`, but that is not sufficient evidence to mark the historical migrations applied.

A read-only diff against the current Prisma model **with only the new push field removed** also found differences: 25 missing indexes, 4 missing foreign keys, and 5 `updated_at` defaults that the model does not declare. The SQL is saved in [prisma-release-schema-diff.sql](prisma-release-schema-diff.sql) for review only; it has not been executed. This model diff does not cover all SQL features, including RLS policies and grants in the historical delivery migration.

**Do not run the release command against the current database yet.** With no migration history, it would treat the initial and delivery migrations as pending too. `migrate deploy` does not reconcile existing schema differences. A reviewed baseline is required for this populated database: [Prisma baselining workflow](https://www.prisma.io/docs/orm/prisma-migrate/workflows/baselining).

Before a full Prisma release, take a recoverable backup, review both historical SQL migrations against the existing schema (including RLS and grants), and agree on the reconciliation/baseline. Validate that plan on a restored copy, including existing data that may violate the missing foreign keys. Only mark historical migrations applied after their required effects have been verified or safely reconciled. The push migration SQL has now been executed and its effect verified; incorporate that verified change into the reviewed history reconciliation so it is not executed a second time. No baseline or migration-resolution commands were run in this task.

## Production command, after the baseline is reviewed and established

`package.json` already defines `db:migrate` as **`prisma migrate deploy`**. `db:dev` is separately defined as `prisma migrate dev`; it is not the release command.

Use a release checkout/job with the locked dependencies installed, including the Prisma CLI. The current Docker runtime installs dependencies with `--omit=dev`, while `prisma` is a dev dependency, so do not assume the final runtime image provides the CLI. In a fresh release job, install dependencies with `npm ci --include=dev` and generate there. On the local Windows checkout, stop DLL-owning processes before regenerating.

Provide the reviewed release secrets through the deployment environment. Before any write, verify that `DIRECT_URL` selects the same project reference, `/postgres` database and `schema=workforce`, using a reachable direct or session connection. A production environment can override the local `.env`; do not assume this local verification proves its variables.

From `backend`, inspect migration status:

```powershell
npx --no-install prisma migrate status --schema=prisma/schema.prisma
```

Proceed only after history has been reconciled, with no failed/divergent migrations and only genuinely unapplied SQL pending. Because the push column has already been applied out of band, the reviewed reconciliation must account for it before deployment. Pending status can return exit code 1; inspect the reported names rather than treating that exit code as approval. The missing migration-history table still fails this gate.

The release command is then:

```powershell
npm run db:migrate -- --schema=prisma/schema.prisma
```

This expands to `prisma migrate deploy --schema=prisma/schema.prisma`. The push migration SQL adds `users.push_enabled BOOLEAN NOT NULL DEFAULT false`, preserving existing users and giving them an opt-out default. That exact SQL was applied through the approved guarded transaction; this deploy command was **not** run against the existing database and must not be used to repeat the already applied statement.

After the approved release, rerun migration status and verify the column using read-only SQL:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'workforce'
  AND table_name = 'users'
  AND column_name = 'push_enabled';
```

Column verification already returns `boolean`, `NO`, and a false default. A clean migration status remains a separate requirement after history reconciliation. Keep push disabled until the remaining OneSignal setup and acceptance checks in [ONESIGNAL.md](ONESIGNAL.md) are complete.
