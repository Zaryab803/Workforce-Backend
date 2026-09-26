import { authorizeTask } from "../../middleware/authorize.js";
import { transaction } from "../../utils/transaction.js";
import { assert } from "../../utils/errors.js";
import { dateValue } from "../../utils/schema.js";
import { appendAudit } from "../audit/audit.repository.js";
import { activityRepository } from "./activity.repository.js";
export function activityService(db) {
  const repo = activityRepository(db);
  return {
    async list(user, id, q) {
      await authorizeTask(db, user, id);
      const p = await repo.list(id, q);
      return {
        ...p,
        data: p.data.map((a) => ({ ...a, hours: Number(a.hours) })),
      };
    },
    async history(user, id, q) {
      await authorizeTask(db, user, id);
      return repo.history(id, { ...q, sortBy: "createdAt" });
    },
    create: (user, id, data, ctx) =>
      transaction(db, async (tx) => {
        const task = await authorizeTask(tx, user, id);
        assert(
          task.status !== "CANCELLED",
          409,
          "TASK_CANCELLED",
          "Work cannot be logged against cancelled tasks.",
        );
        assert(
          data.activityDate <= new Date().toISOString().slice(0, 10),
          400,
          "FUTURE_ACTIVITY",
          "Activity date cannot be in the future (UTC).",
        );
        const sum = await tx.workActivity.aggregate({
          where: {
            userId: user.id,
            activityDate: dateValue(data.activityDate),
          },
          _sum: { hours: true },
        });
        assert(
          Number(sum._sum.hours || 0) + data.hours <= 24,
          409,
          "DAILY_HOURS_LIMIT",
          "Total logged hours cannot exceed 24 hours in one day.",
        );
        const changed = await tx.task.updateMany({
          where: { id, version: data.version, deletedAt: null },
          data: {
            actualHours: { increment: data.hours },
            version: { increment: 1 },
          },
        });
        assert(
          changed.count === 1,
          409,
          "TASK_VERSION_CONFLICT",
          "This task was modified by another user. Refetch before logging time.",
        );
        const activity = await tx.workActivity.create({
          data: {
            taskId: id,
            userId: user.id,
            description: data.description,
            hours: data.hours,
            activityDate: dateValue(data.activityDate),
          },
        });
        await appendAudit(
          tx,
          user,
          "WORK_ACTIVITY_RECORDED",
          "Task",
          id,
          {
            activityId: activity.id,
            hours: data.hours,
            version: data.version + 1,
          },
          ctx,
        );
        return {
          ...activity,
          hours: Number(activity.hours),
          taskVersion: data.version + 1,
        };
      }),
  };
}
