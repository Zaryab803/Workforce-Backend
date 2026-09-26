import { z } from "zod";
import { uuid, pageQuery, nonempty } from "../../utils/schema.js";
export const teamCreate = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().max(1000).default(""),
    managerId: uuid,
  })
  .strict();
export const teamUpdate = nonempty(teamCreate.partial());
export const teamQuery = pageQuery
  .extend({ sortBy: z.enum(["name", "createdAt"]).default("name") })
  .strict();
export const memberBody = z.object({ userId: uuid }).strict();
export const memberParams = z.object({ id: uuid, userId: uuid }).strict();
