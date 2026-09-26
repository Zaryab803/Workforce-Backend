import { publicUserSelect } from "../../utils/user.js";
import { userScope } from "../../middleware/authorize.js";
export const userRepository = (db) => ({
  async list(user, q) {
    const where = {
      AND: [
        { deletedAt: null },
        userScope(user),
        q.search
          ? {
              OR: [
                { name: { contains: q.search, mode: "insensitive" } },
                { email: { contains: q.search, mode: "insensitive" } },
                { employeeCode: { contains: q.search, mode: "insensitive" } },
              ],
            }
          : {},
        q.role ? { role: { name: q.role } } : {},
        q.teamId ? { memberships: { some: { teamId: q.teamId } } } : {},
        q.status ? { employmentStatus: q.status } : {},
        q.isActive !== undefined ? { isActive: q.isActive } : {},
      ],
    };
    const [data, total] = await db.$transaction([
      db.user.findMany({
        where,
        select: publicUserSelect,
        orderBy: [{ [q.sortBy]: q.sortOrder }, { id: "asc" }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      db.user.count({ where }),
    ]);
    return { data, total, page: q.page, limit: q.limit };
  },
  find: (id, scope = {}) =>
    db.user.findFirst({
      where: { id, deletedAt: null, ...scope },
      select: publicUserSelect,
    }),
});
