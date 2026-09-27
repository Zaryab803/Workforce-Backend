import { assert } from "../../utils/errors.js";
import { transaction } from "../../utils/transaction.js";
import { appendAudit } from "../audit/audit.repository.js";
import { teamRepository, teamInclude } from "./team.repository.js";
import { serializeUser } from "../../utils/user.js";
import { serializeTask, taskInclude } from "../tasks/task.repository.js";

const checkManager = async (tx, id) =>
  assert(
    await tx.user.findFirst({
      where: {
        id,
        isActive: true,
        deletedAt: null,
        role: { name: { in: ["ADMIN", "MANAGER"] } },
      },
    }),
    400,
    "INVALID_MANAGER",
    "Choose an active administrator or manager.",
  );

export function teamService(db) {
  const repo = teamRepository(db);
  return {
    async list(user, q) {
      const page = await repo.list(user, q);
      return {
        ...page,
        data: (page.data || []).map((t) => ({
          ...t,
          members: t._count?.members ?? 0,
          activeTasks: t._count?.tasks ?? 0,
        })),
      };
    },

    async get(user, id) {
      const team = await repo.get(user, id);
      assert(
        team,
        404,
        "TEAM_NOT_FOUND",
        "Team was not found in your permitted scope.",
      );

      const members = await db.user.findMany({
        where: { memberships: { some: { teamId: id } }, deletedAt: null },
        include: { role: true, memberships: true },
      });
      const tasks = await db.task.findMany({
        where: { teamId: id, deletedAt: null },
        include: taskInclude,
      });

      const mappedMembers = members.map(serializeUser);
      const mappedTasks = tasks.map(serializeTask);
      const formatted = {
        ...team,
        members: team._count?.members ?? mappedMembers.length,
        activeTasks: team._count?.tasks ?? mappedTasks.length,
      };

      return {
        ...formatted,
        team: formatted,
        members: mappedMembers,
        tasks: mappedTasks,
      };
    },

    create: (user, data, ctx) =>
      transaction(db, async (tx) => {
        const { color: _color, ...teamData } = data;
        await checkManager(tx, teamData.managerId);
        const team = await tx.team.create({ data: teamData, include: teamInclude });
        await appendAudit(
          tx,
          user,
          "TEAM_CREATED",
          "Team",
          team.id,
          { managerId: teamData.managerId },
          ctx,
        );
        return {
          ...team,
          color: _color || "#6366f1",
          members: team._count?.members ?? 0,
          activeTasks: team._count?.tasks ?? 0,
        };
      }),

    update: (user, id, data, ctx) =>
      transaction(db, async (tx) => {
        const { color: _color, ...teamData } = data;
        if (teamData.managerId) await checkManager(tx, teamData.managerId);
        const team = await tx.team.update({
          where: { id },
          data: teamData,
          include: teamInclude,
        });
        await appendAudit(
          tx,
          user,
          "TEAM_UPDATED",
          "Team",
          id,
          { changedFields: Object.keys(data) },
          ctx,
        );
        return {
          ...team,
          color: _color || "#6366f1",
          members: team._count?.members ?? 0,
          activeTasks: team._count?.tasks ?? 0,
        };
      }),

    addMember: (user, id, userId, ctx) =>
      transaction(db, async (tx) => {
        assert(
          await tx.team.findUnique({ where: { id } }),
          404,
          "TEAM_NOT_FOUND",
          "Team was not found.",
        );
        assert(
          await tx.user.findFirst({
            where: { id: userId, isActive: true, deletedAt: null },
          }),
          400,
          "INVALID_MEMBER",
          "Choose an active user.",
        );
        const member = await tx.teamMember.create({
          data: { teamId: id, userId },
        });
        await appendAudit(
          tx,
          user,
          "TEAM_MEMBER_ADDED",
          "Team",
          id,
          { userId },
          ctx,
        );
        return member;
      }),

    removeMember: (user, id, userId, ctx) =>
      transaction(db, async (tx) => {
        assert(
          (await tx.task.count({
            where: {
              teamId: id,
              assigneeId: userId,
              deletedAt: null,
              status: { notIn: ["COMPLETED", "CANCELLED"] },
            },
          })) === 0,
          409,
          "ACTIVE_ASSIGNMENTS",
          "Reassign or close this member’s open tasks first.",
        );
        await tx.teamMember.delete({
          where: { teamId_userId: { teamId: id, userId } },
        });
        await appendAudit(
          tx,
          user,
          "TEAM_MEMBER_REMOVED",
          "Team",
          id,
          { userId },
          ctx,
        );
        return { removed: true };
      }),
  };
}
