import { z } from "zod";
import { uuid, pageQuery, nonempty } from "../../utils/schema.js";
export const projectStatus = z.enum([
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "ARCHIVED",
]);
export const projectCreate = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().max(3000).default(""),
    teamId: uuid,
    status: projectStatus.default("ACTIVE"),
  })
  .strict();
export const projectUpdate = nonempty(
  projectCreate.omit({ teamId: true }).partial(),
);
export const projectQuery = pageQuery
  .extend({
    teamId: uuid.optional(),
    status: projectStatus.optional(),
    sortBy: z.enum(["name", "createdAt", "status"]).default("name"),
  })
  .strict();
