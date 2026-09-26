import { z } from "zod";
import { day, hours, version, pageQuery } from "../../utils/schema.js";
export const activityCreate = z
  .object({
    description: z.string().trim().min(3).max(2000),
    hours,
    activityDate: day,
    version,
  })
  .strict();
export const activityQuery = pageQuery
  .omit({ search: true })
  .extend({
    sortBy: z.enum(["createdAt", "activityDate"]).default("createdAt"),
  })
  .strict();
