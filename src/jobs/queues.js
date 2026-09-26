import { Queue } from "bullmq";
export const queueNames = {
  maintenance: "orbit-maintenance",
  outbox: "orbit-outbox",
  live: "orbit-live-outbox",
  notifications: "orbit-notifications",
};
export const jobOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 2000 },
  removeOnComplete: { age: 86400, count: 1000 },
  removeOnFail: { age: 7 * 86400, count: 5000 },
};
export function createQueues(connection) {
  return {
    live: new Queue(queueNames.live, {
      connection,
      defaultJobOptions: jobOptions,
    }),
    outbox: new Queue(queueNames.outbox, {
      connection,
      defaultJobOptions: jobOptions,
    }),
    maintenance: new Queue(queueNames.maintenance, {
      connection,
      defaultJobOptions: jobOptions,
    }),
    notifications: new Queue(queueNames.notifications, {
      connection,
      defaultJobOptions: jobOptions,
    }),
  };
}
