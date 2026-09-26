import { paginate } from "../../utils/pagination.js";
import { projectScope } from "../../middleware/authorize.js";
import { personSelect } from "../../utils/user.js";
export const projectInclude = {
  team: { select: { id: true, name: true } },
  creator: { select: personSelect },
};
export const projectRepository = (db) => ({
  list: (user, q) =>
    paginate(
      db,
      "project",
      {
        AND: [
          projectScope(user),
          q.teamId ? { teamId: q.teamId } : {},
          q.status ? { status: q.status } : {},
          q.search ? { name: { contains: q.search, mode: "insensitive" } } : {},
        ],
      },
      q,
      projectInclude,
    ),
  get: (user, id) =>
    db.project.findFirst({
      where: { id, ...projectScope(user) },
      include: projectInclude,
    }),
});
