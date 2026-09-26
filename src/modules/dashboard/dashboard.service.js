import { dashboardRepository } from "./dashboard.repository.js";
import { serializeTask } from "../tasks/task.repository.js";

export const dashboardService = (db) => ({
  async get(user) {
    const data = await dashboardRepository(db).aggregate(user);
    const actualHours = Number(data.hours?._sum?.actualHours || 0);
    const recentTasks = (data.recentTasks || []).map(serializeTask);

    const assigneeIds = (data.workload || []).map((w) => w.assigneeId).filter(Boolean);
    const assignees = await db.user.findMany({
      where: { id: { in: assigneeIds } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(assignees.map((u) => [u.id, u.name]));

    const statusCounts = new Map((data.tasksByStatus || []).map((s) => [s.status, s.count]));
    const priorityCounts = new Map((data.tasksByPriority || []).map((p) => [p.priority, p.count]));

    const statusList = [
      "TODO",
      "IN_PROGRESS",
      "BLOCKED",
      "IN_REVIEW",
      "COMPLETED",
      "CANCELLED",
    ].map((name) => ({ name, value: statusCounts.get(name) || 0 }));

    const priorityList = ["LOW", "MEDIUM", "HIGH", "URGENT"].map((name) => ({
      name,
      value: priorityCounts.get(name) || 0,
    }));

    const trend = Array.from({ length: 7 }, (_, i) => {
      const day = new Date();
      day.setUTCDate(day.getUTCDate() - 6 + i);
      const name = day.toLocaleDateString("en-US", { weekday: "short" });
      return {
        name,
        completed: i === 6 ? data.completedTasks : Math.max(0, Math.round(data.completedTasks / 7)),
        created: i === 6 ? data.totalTasks : Math.max(0, Math.round(data.totalTasks / 7)),
      };
    });

    const workload = (data.workload || []).map((w) => ({
      name: nameMap.get(w.assigneeId) || "Team Member",
      assigneeId: w.assigneeId,
      tasks: w._count?._all || 0,
      hours: Number(w._sum?.estimatedHours || 0),
    }));

    const activities = await db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { actor: { select: { id: true, name: true, avatarUrl: true } } },
    });

    const recentActivity = activities.map((a) => ({
      id: a.id,
      actorId: a.actorId,
      action: a.action,
      entity: a.entity,
      entityId: a.entityId,
      description: `${a.actor?.name || "System"} ${a.action.toLowerCase().replace(/_/g, " ")} ${a.entity}`,
      createdAt: a.createdAt.toISOString(),
    }));

    return {
      ...data,
      employees: data.totalEmployees,
      active: data.activeEmployees,
      teams: data.totalTeams,
      tasks: data.totalTasks,
      completed: data.completedTasks,
      overdue: data.overdueTasks,
      dueToday: data.dueToday,
      hours: actualHours,
      actualHours,
      status: statusList,
      priority: priorityList,
      trend,
      workload,
      recent: recentTasks,
      recentTasks,
      activity: recentActivity,
      scope: user.role,
    };
  },
});
