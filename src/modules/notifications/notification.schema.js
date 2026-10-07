import { pageQuery, queryBoolean } from "../../utils/schema.js";
import { z } from "zod";
export const pushPreference = z.object({ enabled: z.boolean() }).strict();
export const notificationQuery = pageQuery
  .omit({ search: true })
  .extend({
    isRead: queryBoolean.optional(),
    sortBy: z.enum(["createdAt"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();
