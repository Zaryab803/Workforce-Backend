import { paginate } from "../../utils/pagination.js";
import { personSelect } from "../../utils/user.js";
import { taskScope } from "../../middleware/authorize.js";
import { dateValue } from "../../utils/schema.js";
export const taskInclude = {
  assignee: { select: personSelect },
  creator: { select: personSelect },
  project: { select: { id: true, name: true } },
  team: { select: { id: true, name: true } },
};
export const serializeTask = (t) => {
  if (!t) return null;
  const projectName =
    typeof t.project === "object" && t.project !== null
      ? t.project.name
      : t.project || "General";
  const projectId =
    t.projectId ||
    (typeof t.project === "object" && t.project !== null ? t.project.id : undefined);
  const formattedDueDate = t.dueDate
    ? typeof t.dueDate === "string"
      ? t.dueDate.slice(0, 10)
      : new Date(t.dueDate).toISOString().slice(0, 10)
    : "";

  return {
    ...t,
    project: projectName,
    projectId,
    teamId:
      t.teamId ||
      (typeof t.team === "object" && t.team !== null ? t.team.id : undefined),
    dueDate: formattedDueDate,
    estimatedHours: Number(t.estimatedHours || 0),
    actualHours: Number(t.actualHours || 0),
  };
};
export function taskWhere(user, q = {}) {
  return {
    AND: [
      { deletedAt: null },
      taskScope(user),
      q.search
        ? {
            OR: [
              { title: { contains: q.search, mode: "insensitive" } },
              { description: { contains: q.search, mode: "insensitive" } },
            ],
          }
        : {},
      ...["status", "priority", "assigneeId", "teamId", "projectId"].map((k) =>
        q[k] ? { [k]: q[k] } : {},
      ),
      q.dueDate ? { dueDate: dateValue(q.dueDate) } : {},
      q.dueFrom || q.dueTo
        ? {
            dueDate: {
              ...(q.dueFrom ? { gte: dateValue(q.dueFrom) } : {}),
              ...(q.dueTo ? { lte: dateValue(q.dueTo) } : {}),
            },
          }
        : {},
    ],
  };
}
export const taskRepository = (db) => ({
  list: (user, q) => paginate(db, "task", taskWhere(user, q), q, taskInclude),
  get: (id) => db.task.findUnique({ where: { id }, include: taskInclude }),
});
