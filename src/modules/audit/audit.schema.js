import { z } from "zod";
import { uuid, day, pageQuery } from "../../utils/schema.js";
export const auditQuery = pageQuery
  .extend({
    actorId: uuid.optional(),
    action: z.string().max(60).optional(),
    entity: z.enum(["User", "Team", "Project", "Task"]).optional(),
    entityId: z.string().max(100).optional(),
    date: day.optional(),
    sortBy: z.enum(["createdAt", "action", "entity"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();
