import bcrypt from "bcrypt";
import { env } from "../../config/env.js";
import { assert } from "../../utils/errors.js";
import { dateValue } from "../../utils/schema.js";
import { publicUserSelect, serializeUser } from "../../utils/user.js";
import { transaction } from "../../utils/transaction.js";
import { userScope } from "../../middleware/authorize.js";
import { appendAudit } from "../audit/audit.repository.js";
import { userRepository } from "./user.repository.js";
import { serializeTask, taskInclude } from "../tasks/task.repository.js";

async function validateRelations(tx, data, id) {
  if (data.managerId) {
    assert(
      data.managerId !== id,
      400,
      "INVALID_MANAGER",
      "A user cannot report to themselves.",
    );
    const manager = await tx.user.findFirst({
      where: {
        id: data.managerId,
        isActive: true,
        deletedAt: null,
        role: { name: { in: ["ADMIN", "MANAGER"] } },
      },
    });
    assert(
      manager,
      400,
      "INVALID_MANAGER",
      "Choose an active manager or administrator.",
    );
    let cursor = manager;
    const seen = new Set([id]);
    while (cursor?.managerId) {
      assert(
        !seen.has(cursor.managerId),
        409,
        "REPORTING_CYCLE",
        "This assignment would create a reporting cycle.",
      );
      seen.add(cursor.managerId);
      cursor = await tx.user.findUnique({ where: { id: cursor.managerId } });
    }
  }
  if (data.teamIds) {
    assert(
      new Set(data.teamIds).size === data.teamIds.length,
      400,
      "DUPLICATE_TEAM",
      "Team IDs must be unique.",
    );
    assert(
      (await tx.team.count({ where: { id: { in: data.teamIds } } })) ===
        data.teamIds.length,
      400,
      "INVALID_TEAM",
      "One or more teams do not exist.",
    );
  }
}

export function userService(db) {
  const repo = userRepository(db);
  return {
    async list(user, q) {
      const result = await repo.list(user, q);
      return { ...result, data: result.data.map(serializeUser) };
    },

    async get(user, id) {
      const u = await repo.find(id, userScope(user));
      assert(
        u,
        404,
        "USER_NOT_FOUND",
        "User was not found in your permitted scope.",
      );
      const employee = serializeUser(u);

      const tasks = await db.task.findMany({
        where: { assigneeId: id, deletedAt: null },
        include: taskInclude,
        take: 20,
      });
      const activity = await db.auditLog.findMany({
        where: { actorId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
      });

      const mappedTasks = tasks.map(serializeTask);
      const mappedActivity = activity.map((a) => ({
        id: a.id,
        actorId: a.actorId,
        action: a.action,
        entity: a.entity,
        entityId: a.entityId,
        description: a.details
          ? JSON.stringify(a.details)
          : `${a.action} on ${a.entity}`,
        createdAt: a.createdAt.toISOString(),
      }));

      return {
        ...employee,
        employee,
        tasks: mappedTasks,
        activity: mappedActivity,
      };
    },

    async create(actor, data, ctx) {
      // Map frontend fields to backend fields
      const joiningDate =
        data.joiningDate || data.joined || new Date().toISOString().slice(0, 10);
      const teamIds =
        data.teamIds?.length
          ? data.teamIds
          : data.teamId
            ? [data.teamId]
            : [];
      const isActive =
        data.isActive !== undefined
          ? data.isActive
          : data.active !== undefined
            ? data.active
            : true;
      const avatarUrl = data.avatarUrl || data.avatar || null;
      const employeeCode =
        data.employeeCode || "ORB-" + Math.floor(1000 + Math.random() * 9000);
      const managerId = data.managerId || null;
      const password = data.password || "Demo123!";

      const normalized = {
        ...data,
        employeeCode,
        joiningDate,
        teamIds,
        isActive,
        avatarUrl,
        managerId,
        password,
      };
      delete normalized.joined;
      delete normalized.teamId;
      delete normalized.active;
      delete normalized.avatar;
      delete normalized.position;

      const passwordHash = await bcrypt.hash(normalized.password, env.BCRYPT_ROUNDS);
      return transaction(db, async (tx) => {
        await validateRelations(tx, normalized);
        const role = await tx.role.findUnique({
          where: { name: normalized.role },
        });
        assert(
          role,
          400,
          "ROLE_NOT_FOUND",
          "Run the database seed to create system roles.",
        );
        const {
          password: _password,
          role: _role,
          teamIds: _t,
          joiningDate: _j,
          ...fields
        } = normalized;
        const user = await tx.user.create({
          data: {
            ...fields,
            passwordHash,
            joiningDate: dateValue(joiningDate),
            roleId: role.id,
            memberships: { create: teamIds.map((teamId) => ({ teamId })) },
          },
          select: publicUserSelect,
        });
        await appendAudit(
          tx,
          actor,
          "USER_CREATED",
          "User",
          user.id,
          { role: normalized.role, teamIds },
          ctx,
        );
        return serializeUser(user);
      });
    },

    async update(actor, id, data, ctx) {
      const normalized = { ...data };
      if (normalized.joined) normalized.joiningDate = normalized.joined;
      if (
        normalized.teamId &&
        (!normalized.teamIds || !normalized.teamIds.length)
      ) {
        normalized.teamIds = [normalized.teamId];
      }
      if (normalized.active !== undefined) normalized.isActive = normalized.active;
      if (normalized.avatar !== undefined) normalized.avatarUrl = normalized.avatar;
      if (normalized.managerId === "") normalized.managerId = null;
      delete normalized.joined;
      delete normalized.teamId;
      delete normalized.active;
      delete normalized.avatar;
      delete normalized.position;

      const passwordHash = normalized.password
        ? await bcrypt.hash(normalized.password, env.BCRYPT_ROUNDS)
        : undefined;

      return transaction(db, async (tx) => {
        const current = await tx.user.findUnique({
          where: { id },
          include: { role: true },
        });
        assert(
          current && !current.deletedAt,
          404,
          "USER_NOT_FOUND",
          "User was not found.",
        );
        await validateRelations(tx, normalized, id);
        assert(
          !(
            actor.id === id &&
            (normalized.isActive === false ||
              (normalized.role && normalized.role !== "ADMIN"))
          ),
          409,
          "SELF_LOCKOUT",
          "You cannot revoke your own administrator access.",
        );
        if (normalized.isActive === false || normalized.role === "EMPLOYEE") {
          assert(
            (await tx.team.count({ where: { managerId: id } })) === 0,
            409,
            "MANAGER_IN_USE",
            "Assign another manager to this user’s teams first.",
          );
          assert(
            (await tx.user.count({
              where: { managerId: id, deletedAt: null },
            })) === 0,
            409,
            "MANAGER_IN_USE",
            "Reassign this user’s direct reports first.",
          );
        }
        if (normalized.teamIds) {
          const removed = await tx.teamMember.findMany({
            where: { userId: id, teamId: { notIn: normalized.teamIds } },
          });
          assert(
            (await tx.task.count({
              where: {
                assigneeId: id,
                teamId: { in: removed.map((m) => m.teamId) },
                deletedAt: null,
                status: { notIn: ["COMPLETED", "CANCELLED"] },
              },
            })) === 0,
            409,
            "ACTIVE_ASSIGNMENTS",
            "Reassign open tasks before removing team membership.",
          );
          await tx.teamMember.deleteMany({ where: { userId: id } });
          await tx.teamMember.createMany({
            data: normalized.teamIds.map((teamId) => ({ teamId, userId: id })),
          });
        }
        const {
          password: _password,
          role,
          teamIds: _teams,
          joiningDate,
          ...fields
        } = normalized;
        const changedRole = role && role !== current.role.name;
        const invalidates =
          !!passwordHash || changedRole || normalized.isActive === false;
        const updated = await tx.user.update({
          where: { id },
          data: {
            ...fields,
            ...(joiningDate ? { joiningDate: dateValue(joiningDate) } : {}),
            ...(role ? { role: { connect: { name: role } } } : {}),
            ...(passwordHash ? { passwordHash } : {}),
            ...(invalidates ? { tokenVersion: { increment: 1 } } : {}),
          },
          select: publicUserSelect,
        });
        if (invalidates)
          await tx.refreshSession.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        await appendAudit(
          tx,
          actor,
          normalized.isActive === false ? "USER_DEACTIVATED" : "USER_UPDATED",
          "User",
          id,
          {
            changedFields: Object.keys(normalized).filter(
              (k) => k !== "password",
            ),
            passwordChanged: !!passwordHash,
          },
          ctx,
        );
        return serializeUser(updated);
      });
    },
  };
}
