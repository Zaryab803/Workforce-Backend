import { taskScope, userScope, teamScope } from "../../middleware/authorize.js";
import { taskInclude } from "../tasks/task.repository.js";
export const dashboardRepository = (db) => ({
  async aggregate(user) {
    const scoped = { deletedAt: null, ...taskScope(user) };
    const now = new Date();
    const today = new Date(now.toISOString().slice(0, 10) + "T00:00:00Z");
    const open = { ...scoped, status: { notIn: ["COMPLETED", "CANCELLED"] } };
    const [
      totalEmployees,
      activeEmployees,
      totalTeams,
      totalTasks,
      completedTasks,
      overdueTasks,
      dueToday,
      status,
      priority,
      hours,
      recentTasks,
      workload,
    ] = await db.$transaction([
      db.user.count({ where: { deletedAt: null, ...userScope(user) } }),
      db.user.count({
        where: { deletedAt: null, isActive: true, ...userScope(user) },
      }),
      db.team.count({ where: teamScope(user) }),
      db.task.count({ where: scoped }),
      db.task.count({ where: { ...scoped, status: "COMPLETED" } }),
      db.task.count({ where: { ...open, dueDate: { lt: today } } }),
      db.task.count({ where: { ...open, dueDate: today } }),
      db.task.groupBy({
        by: ["status"],
        where: scoped,
        _count: { _all: true },
      }),
      db.task.groupBy({
        by: ["priority"],
        where: scoped,
        _count: { _all: true },
      }),
      db.task.aggregate({
        where: scoped,
        _sum: { actualHours: true, estimatedHours: true },
      }),
      db.task.findMany({
        where: open,
        orderBy: [{ dueDate: "asc" }, { id: "asc" }],
        take: 5,
        include: taskInclude,
      }),
      db.task.groupBy({
        by: ["assigneeId"],
        where: open,
        _count: { _all: true },
        _sum: { estimatedHours: true },
        orderBy: { _count: { assigneeId: "desc" } },
        take: 10,
      }),
    ]);
    return {
      totalEmployees,
      activeEmployees,
      totalTeams,
      totalTasks,
      completedTasks,
      overdueTasks,
      dueToday,
      tasksByStatus: status.map((x) => ({
        status: x.status,
        count: x._count._all,
      })),
      tasksByPriority: priority.map((x) => ({
        priority: x.priority,
        count: x._count._all,
      })),
      hours,
      recentTasks,
      workload,
    };
  },
});
