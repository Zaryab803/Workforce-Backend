import {
  createOutboxDelivery,
  processOutbox,
} from "../jobs/outbox.processor.js";
import { Worker } from "bullmq";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { createQueues, queueNames } from "../jobs/queues.js";
import { processOverdue, deliverOverdue } from "../jobs/overdue.processor.js";
export async function startWorkers({ db, connection }) {
  const queues = createQueues(connection);
  await queues.maintenance.upsertJobScheduler(
    "daily-overdue",
    { pattern: env.OVERDUE_CRON, tz: env.JOB_TIMEZONE },
    {
      name: "scan-overdue",
      data: {},
      opts: { attempts: 5, backoff: { type: "exponential", delay: 2000 } },
    },
  );
  await queues.outbox.upsertJobScheduler(
    "delivery-outbox",
    { every: env.OUTBOX_INTERVAL_MS },
    { name: "drain-outbox", data: {} },
  );
  await queues.live.upsertJobScheduler(
    "live-outbox",
    { every: env.OUTBOX_INTERVAL_MS },
    { name: "drain-live", data: {} },
  );
  const deliver = createOutboxDelivery(db, connection);
  const workers = [
    new Worker(
      queueNames.live,
      () =>
        processOutbox(db, deliver, {
          kinds: ["COMMENT_LIVE", "NOTIFICATION_LIVE"],
        }),
      { connection, concurrency: 1 },
    ),
    new Worker(
      queueNames.outbox,
      () => processOutbox(db, deliver, { kinds: ["EMAIL", "PUSH"] }),
      {
        connection,
        concurrency: 1,
      },
    ),
    new Worker(
      queueNames.maintenance,
      () => processOverdue(db, queues.notifications),
      { connection, concurrency: 1 },
    ),
    new Worker(
      queueNames.notifications,
      (job) => deliverOverdue(db, job.data),
      { connection, concurrency: 5 },
    ),
  ];
  for (const worker of workers) {
    worker.on("completed", (job) =>
      logger.info({ queue: worker.name, jobId: job.id }, "Job completed"),
    );
    worker.on("failed", (job, error) =>
      logger.error(
        {
          queue: worker.name,
          jobId: job?.id,
          attempt: job?.attemptsMade,
          code: error.code || error.name,
        },
        "Job failed; retry policy applies",
      ),
    );
    worker.on("error", (error) =>
      logger.error(
        { queue: worker.name, code: error.code || error.name },
        "Worker error",
      ),
    );
  }

  return {
    close: async () => {
      await Promise.all(workers.map((worker) => worker.close()));
      await Promise.all(Object.values(queues).map((queue) => queue.close()));
    },
  };
}
