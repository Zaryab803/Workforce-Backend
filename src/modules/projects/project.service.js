import { assert } from "../../utils/errors.js";
import { transaction } from "../../utils/transaction.js";
import { assertTeamScope } from "../../middleware/authorize.js";
import { appendAudit } from "../audit/audit.repository.js";
import { projectRepository, projectInclude } from "./project.repository.js";
export function projectService(db) {
  const repo = projectRepository(db);
  return {
    list: repo.list,
    async get(user, id) {
      const p = await repo.get(user, id);
      assert(
        p,
        404,
        "PROJECT_NOT_FOUND",
        "Project was not found in your permitted scope.",
      );
      return p;
    },
    create: (user, data, ctx) =>
      transaction(db, async (tx) => {
        await assertTeamScope(tx, user, data.teamId);
        const p = await tx.project.create({
          data: { ...data, createdBy: user.id },
          include: projectInclude,
        });
        await appendAudit(
          tx,
          user,
          "PROJECT_CREATED",
          "Project",
          p.id,
          { teamId: p.teamId },
          ctx,
        );
        return p;
      }),
    update: (user, id, data, ctx) =>
      transaction(db, async (tx) => {
        const existing = await tx.project.findUnique({ where: { id } });
        assert(existing, 404, "PROJECT_NOT_FOUND", "Project was not found.");
        await assertTeamScope(tx, user, existing.teamId);
        if (["ARCHIVED", "COMPLETED"].includes(data.status))
          assert(
            (await tx.task.count({
              where: {
                projectId: id,
                deletedAt: null,
                status: { notIn: ["COMPLETED", "CANCELLED"] },
              },
            })) === 0,
            409,
            "OPEN_TASKS",
            "Finish or cancel open tasks before closing this project.",
          );
        const p = await tx.project.update({
          where: { id },
          data,
          include: projectInclude,
        });
        await appendAudit(
          tx,
          user,
          "PROJECT_UPDATED",
          "Project",
          id,
          { changedFields: Object.keys(data) },
          ctx,
        );
        return p;
      }),
  };
}
