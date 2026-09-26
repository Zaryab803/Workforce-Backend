import { createRedis } from "../src/config/redis.js";
import { createQueues } from "../src/jobs/queues.js";
const redis = createRedis();
await redis.connect();
const queues = createQueues(redis);
try {
  const job = await queues.maintenance.add("scan-overdue", {});
  console.log("Overdue scan queued:", job.id);
} finally {
  await Promise.all(Object.values(queues).map((q) => q.close()));
  await redis.quit();
}
