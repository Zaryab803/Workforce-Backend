import { assert } from "../../utils/errors.js";
import { dateValue } from "../../utils/schema.js";
import { transaction } from "../../utils/transaction.js";
import { authorizeTask, assertTeamScope } from "../../middleware/authorize.js";
import { appendAudit } from "../audit/audit.repository.js";
import { taskNotification } from "../notifications/notification.repository.js";
import {
  taskRepository,
  taskInclude,
  serializeTask,
} from "./task.repository.js";
import { TRANSITIONS } from "./task.constant.js";
import { publishLiveEvent } from "../../realtime/server.js";
import { personSelect } from "../../utils/user.js";

export function assertTransition(role, from, to) {
  assert(
    from !== to && TRANSITIONS[from]?.includes(to),
    409,
    "INVALID_STATUS_TRANSITION",
    `A task cannot move from ${from} to ${to}.`,
  );
  if (role === "EMPLOYEE")
    assert(
      !["COMPLETED", "CANCELLED"].includes(from) &&
        !["COMPLETED", "CANCELLED", "TODO"].includes(to),
      403,
      "STATUS_NOT_PERMITTED",
      "Employees can start, block, resume, or submit assigned work for review. Managers approve completion.",
    );
}

async function assignment(tx, user, projectId, assigneeId, projectName) {
  let project = null;

  if (projectId) {
    project = await tx.project.findUnique({ where: { id: projectId } });
  } else if (projectName) {
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        projectName,
      );
    project = await tx.project.findFirst({
      where: isUUID
        ? {
            OR: [{ id: projectName }, { name: projectName }],
          }
        : { name: projectName },
    });
  }

  // Find the assignee's team membership or active status
  let member = await tx.teamMember.findFirst({
    where: {
      userId: assigneeId,
      user: { isActive: true, deletedAt: null },
    },
  });

  const assigneeUser = await tx.user.findFirst({
    where: { id: assigneeId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  assert(
    assigneeUser,
    400,
    "INVALID_ASSIGNEE",
    "Assign an active member of the workforce.",
  );

  // Assignment must use existing membership; never silently enroll someone in a team.
  if (!member && !project) {
    const managed = await tx.team.findFirst({
      where: { managerId: assigneeId },
    });
    assert(
      managed,
      400,
      "INVALID_ASSIGNEE",
      "The assignee needs an existing team membership.",
    );
    member = { teamId: managed.id };
  }
  // If project not found or not given, find or create one for member's team
  if (!project) {
    project = await tx.project.findFirst({
      where: { teamId: member.teamId, status: "ACTIVE" },
    });
    if (!project) {
      project = await tx.project.create({
        data: {
          name: projectName || "Core Project",
          teamId: member.teamId,
          status: "ACTIVE",
        },
      });
    }
  }

  const assignedTeam = await assertTeamScope(tx, user, project.teamId);
  const membership = await tx.teamMember.findFirst({
    where: { userId: assigneeId, teamId: project.teamId },
  });
  assert(
    membership || assignedTeam.managerId === assigneeId,
    400,
    "INVALID_ASSIGNEE",
    "Assign a member or manager of the task's team.",
  );
  return project;
}

export function taskService(db) {
  const repo = taskRepository(db);
  return {
    async list(user, q) {
      const page = await repo.list(user, q);
      return { ...page, data: page.data.map(serializeTask) };
    },

    async get(user, id) {
      await authorizeTask(db, user, id);
      const raw = await repo.get(id);
      assert(raw, 404, "TASK_NOT_FOUND", "Task not found.");
      const task = serializeTask(raw);

      const comments = await db.taskComment.findMany({
        where: { taskId: id },
        orderBy: { createdAt: "desc" },
        include: { author: { select: personSelect } },
      });
      const history = await db.taskStatusHistory.findMany({
        where: { taskId: id },
        orderBy: { createdAt: "desc" },
        include: { actor: { select: personSelect } },
      });
      const allUsers = await db.user.findMany({
        where: { deletedAt: null, isActive: true },
        select: personSelect,
      });

      const mappedComments = comments.map((c) => ({
        id: c.id,
        taskId: c.taskId,
        authorId: c.authorId,
        body: c.comment,
        comment: c.comment,
        author: c.author,
        createdAt: c.createdAt.toISOString(),
      }));

      const mappedActivity = history.map((h) => ({
        id: h.id,
        actorId: h.changedBy,
        actor: h.actor,
        action: "STATUS_CHANGED",
        entity: "Task",
        entityId: h.taskId,
        description: `Status changed from ${h.fromStatus || "None"} to ${h.toStatus}`,
        createdAt: h.createdAt.toISOString(),
      }));

      const mappedPeople = allUsers.map((u) => ({
        id: u.id,
        name: u.name,
        avatar: u.avatarUrl || "",
      }));

      return {
        ...task,
        task,
        comments: mappedComments,
        activity: mappedActivity,
        people: mappedPeople,
      };
    },

    create: (user, data, ctx) =>
      transaction(db, async (tx) => {
        const { project: projName, ...taskData } = data;
        const project = await assignment(
          tx,
          user,
          data.projectId,
          data.assigneeId,
          projName,
        );
        const task = await tx.task.create({
          data: {
            ...taskData,
            projectId: project.id,
            dueDate: dateValue(data.dueDate),
            createdBy: user.id,
            teamId: project.teamId,
          },
          include: taskInclude,
        });
        await tx.taskStatusHistory.create({
          data: {
            taskId: task.id,
            fromStatus: null,
            toStatus: "TODO",
            changedBy: user.id,
          },
        });
        await appendAudit(
          tx,
          user,
          "TASK_CREATED",
          "Task",
          task.id,
          { assigneeId: task.assigneeId, projectId: task.projectId },
          ctx,
        );
        await taskNotification(
          tx,
          task,
          "TASK_ASSIGNED",
          "A new task is waiting for you",
          undefined,
          user.id,
        );
        publishLiveEvent({
          kind: "TASK_CHANGED",
          taskId: task.id,
          action: "CREATED",
        });
        return serializeTask(task);
      }),

    update: (user, id, data, ctx) =>
      transaction(db, async (tx) => {
        const existing = await authorizeTask(tx, user, id);
        const { version, project: projName, ...fields } = data;
        const versionToUse = version !== undefined ? version : existing.version;

        let teamId = existing.teamId;
        let projectIdToUse = fields.projectId;

        if (fields.projectId || fields.assigneeId || projName) {
          const p = await assignment(
            tx,
            user,
            fields.projectId || existing.projectId,
            fields.assigneeId || existing.assigneeId,
            projName,
          );
          teamId = p.teamId;
          projectIdToUse = p.id;
        }

        const updateData = {
          ...fields,
          ...(projectIdToUse ? { projectId: projectIdToUse } : {}),
          ...(fields.dueDate ? { dueDate: dateValue(fields.dueDate) } : {}),
          teamId,
          version: { increment: 1 },
        };

        const changed = await tx.task.updateMany({
          where: { id, version: versionToUse, deletedAt: null },
          data: updateData,
        });
        assert(
          changed.count === 1,
          409,
          "TASK_VERSION_CONFLICT",
          "This task was modified by another user.",
        );

        const task = await tx.task.findUnique({
          where: { id },
          include: taskInclude,
        });

        await appendAudit(
          tx,
          user,
          fields.assigneeId && fields.assigneeId !== existing.assigneeId
            ? "TASK_ASSIGNED"
            : "TASK_UPDATED",
          "Task",
          id,
          { version: task.version, changedFields: Object.keys(fields) },
          ctx,
        );
        await taskNotification(
          tx,
          task,
          "TASK_UPDATED",
          "Your task details changed",
          undefined,
          user.id,
        );
        publishLiveEvent({
          kind: "TASK_CHANGED",
          taskId: task.id,
          action: "UPDATED",
        });
        return serializeTask(task);
      }),

    status: (user, id, data, ctx) =>
      transaction(db, async (tx) => {
        const existing = await authorizeTask(tx, user, id);
        const versionToUse =
          data.version !== undefined ? data.version : existing.version;
        assertTransition(user.role, existing.status, data.status);

        const changed = await tx.task.updateMany({
          where: { id, version: versionToUse, deletedAt: null },
          data: { status: data.status, version: { increment: 1 } },
        });
        assert(
          changed.count === 1,
          409,
          "TASK_VERSION_CONFLICT",
          "This task was modified by another user.",
        );

        await tx.taskStatusHistory.create({
          data: {
            taskId: id,
            fromStatus: existing.status,
            toStatus: data.status,
            changedBy: user.id,
          },
        });
        await appendAudit(
          tx,
          user,
          data.status === "COMPLETED"
            ? "TASK_COMPLETED"
            : "TASK_STATUS_CHANGED",
          "Task",
          id,
          { from: existing.status, to: data.status, version: versionToUse + 1 },
          ctx,
        );

        const task = await tx.task.findUnique({
          where: { id },
          include: taskInclude,
        });
        const team = await tx.team.findUnique({ where: { id: task.teamId } });
        for (const recipientId of new Set([task.assigneeId, team?.managerId])) {
          await taskNotification(
            tx,
            { ...task, assigneeId: recipientId },
            "TASK_STATUS_CHANGED",
            "Task status updated",
            undefined,
            user.id,
          );
        }
        publishLiveEvent({
          kind: "TASK_CHANGED",
          taskId: task.id,
          action: "STATUS_CHANGED",
        });
        return serializeTask(task);
      }),

    remove: (user, id, version, ctx) =>
      transaction(db, async (tx) => {
        const existing = await authorizeTask(tx, user, id);
        const versionToUse = version !== undefined ? version : existing.version;

        const updated = await tx.task.updateMany({
          where: { id, version: versionToUse, deletedAt: null },
          data: { deletedAt: new Date(), version: { increment: 1 } },
        });
        assert(
          updated.count === 1,
          409,
          "TASK_VERSION_CONFLICT",
          "This task was modified by another user.",
        );
        await appendAudit(
          tx,
          user,
          "TASK_DELETED",
          "Task",
          id,
          { version: versionToUse + 1 },
          ctx,
        );
        publishLiveEvent({
          kind: "TASK_CHANGED",
          taskId: id,
          action: "DELETED",
        });
        return { deleted: true };
      }),
  };
}
