import { paginate } from "../../utils/pagination.js";
import { personSelect } from "../../utils/user.js";
export const commentRepository = (db) => ({
  list: (taskId, q) =>
    paginate(db, "taskComment", { taskId }, q, {
      author: { select: personSelect },
    }),
});
