import { assert } from "../utils/errors.js";
export const authorizeRoles =
  (...roles) =>
  (req, _res, next) => {
    assert(
      roles.includes(req.user.role),
      403,
      "FORBIDDEN",
      "Your role cannot perform this operation.",
    );
    next();
  };
export const managedTeamWhere = (user) =>
  user.role === "ADMIN" ? {} : { managerId: user.id };
export const userScope = (user) =>
  user.role === "ADMIN"
    ? {}
    : user.role === "MANAGER"
      ? {
          OR: [
            { id: user.id },
            { memberships: { some: { team: { managerId: user.id } } } },
          ],
        }
      : { id: user.id };
export const teamScope = (user) =>
  user.role === "ADMIN"
    ? {}
    : user.role === "MANAGER"
      ? { managerId: user.id }
      : { members: { some: { userId: user.id } } };
export const taskScope = (user) =>
  user.role === "ADMIN"
    ? {}
    : user.role === "MANAGER"
      ? { team: { managerId: user.id } }
      : { assigneeId: user.id };
export const projectScope = (user) =>
  user.role === "ADMIN"
    ? {}
    : user.role === "MANAGER"
      ? { team: { managerId: user.id } }
      : { tasks: { some: { assigneeId: user.id, deletedAt: null } } };
export async function assertTeamScope(db, user, teamId) {
  const team = await db.team.findUnique({ where: { id: teamId } });
  assert(team, 404, "TEAM_NOT_FOUND", "Team was not found.");
  assert(
    user.role === "ADMIN" ||
      (user.role === "MANAGER" && team.managerId === user.id),
    403,
    "FORBIDDEN",
    "This team is outside your permitted scope.",
  );
  return team;
}
export async function authorizeTask(db, user, id) {
  const task = await db.task.findFirst({
    where: { id, deletedAt: null },
    include: { team: { select: { managerId: true } } },
  });
  assert(task, 404, "TASK_NOT_FOUND", "Task was not found.");
  assert(
    user.role === "ADMIN" ||
      (user.role === "MANAGER" && task.team.managerId === user.id) ||
      (user.role === "EMPLOYEE" && task.assigneeId === user.id),
    403,
    "FORBIDDEN",
    "This task is outside your permitted scope.",
  );
  return task;
}
