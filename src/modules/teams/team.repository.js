import { paginate } from "../../utils/pagination.js";
import { teamScope } from "../../middleware/authorize.js";
import { personSelect } from "../../utils/user.js";
export const teamInclude = {
  manager: { select: personSelect },
  _count: {
    select: {
      members: true,
      tasks: {
        where: {
          deletedAt: null,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
      },
    },
  },
};
export const teamRepository = (db) => ({
  list: (user, q) =>
    paginate(
      db,
      "team",
      {
        AND: [
          teamScope(user),
          q.search ? { name: { contains: q.search, mode: "insensitive" } } : {},
        ],
      },
      q,
      teamInclude,
    ),
  get: (user, id) =>
    db.team.findFirst({
      where: { id, ...teamScope(user) },
      include: teamInclude,
    }),
});
