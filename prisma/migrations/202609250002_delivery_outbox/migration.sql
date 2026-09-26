CREATE TABLE "outbox_events" (
  "id" UUID NOT NULL, "key" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "payload" JSONB NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_until" TIMESTAMP(3), "lock_token" UUID,
  "processed_at" TIMESTAMP(3), "failed_at" TIMESTAMP(3),
  "last_error" TEXT, "result" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "outbox_events_key_key" ON "outbox_events"("key");
CREATE INDEX "outbox_events_processed_at_failed_at_available_at_idx"
  ON "outbox_events"("processed_at", "failed_at", "available_at");
ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "outbox_events" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "outbox_events" FROM authenticated;
  END IF;
END $$;

ALTER TABLE "task_comments" ADD COLUMN "client_request_id" UUID;
CREATE UNIQUE INDEX "task_comments_author_id_client_request_id_key" ON "task_comments"("author_id", "client_request_id");
