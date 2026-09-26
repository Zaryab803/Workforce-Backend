import { z } from "zod";
import { pageQuery, uuid } from "../../utils/schema.js";

export const commentCreate = z
  .object({
    comment: z.string().trim().min(1).max(5000).optional(),
    body: z.string().trim().min(1).max(5000).optional(),
    clientRequestId: uuid.optional(),
  })
  .refine((v) => v.comment || v.body, "Comment or body is required.");

export const commentQuery = pageQuery
  .omit({ search: true })
  .extend({ sortBy: z.enum(["createdAt"]).default("createdAt") })
  .strict();
