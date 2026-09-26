import { paginate } from "../../utils/pagination.js";
import { personSelect } from "../../utils/user.js";
import { dateValue } from "../../utils/schema.js";

export const auditService = (db) => ({
  async list(q) {
    const page = await paginate(
      db,
      "auditLog",
      {
        AND: [
          ...["actorId", "action", "entity", "entityId"].map((k) =>
            q[k] ? { [k]: q[k] } : {},
          ),
          q.search
            ? {
                OR: [
                  { action: { contains: q.search, mode: "insensitive" } },
                  { entityId: { contains: q.search, mode: "insensitive" } },
                ],
              }
            : {},
          q.date
            ? {
                createdAt: {
                  gte: dateValue(q.date),
                  lt: new Date(dateValue(q.date).getTime() + 86400000),
                },
              }
            : {},
        ],
      },
      q,
      { actor: { select: personSelect } },
    );

    return {
      ...page,
      data: (page.data || []).map((a) => ({
        ...a,
        description: a.details
          ? typeof a.details === "string"
            ? a.details
            : `${a.actor?.name || "User"} executed ${a.action.toLowerCase().replace(/_/g, " ")} on ${a.entity}`
          : `${a.actor?.name || "User"} executed ${a.action.toLowerCase().replace(/_/g, " ")} on ${a.entity}`,
        createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : "",
      })),
    };
  },
});
