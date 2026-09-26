import { paginate } from "../../utils/pagination.js";
import { personSelect } from "../../utils/user.js";
export const activityRepository = (db) => ({
  list: (taskId, q) =>
    paginate(db, "workActivity", { taskId }, q, {
      user: { select: personSelect },
    }),
  history: (taskId, q) =>
    paginate(db, "taskStatusHistory", { taskId }, q, {
      actor: { select: personSelect },
    }),
});
