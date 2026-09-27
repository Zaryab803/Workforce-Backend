import { z } from "zod";
import { uuid, day, version, pageQuery } from "../../utils/schema.js";
import { STATUSES, PRIORITIES } from "./task.constant.js";
export const taskCreate = z
  .object({
    title: z.string().trim().min(3).max(180),
    description: z.string().max(10000).default(""),
    projectId: uuid.optional(),
    project: z.string().optional(),
    assigneeId: uuid,
    priority: z.enum(PRIORITIES).default("MEDIUM"),
    dueDate: day,
    estimatedHours: z.number().min(0.01).max(9999),
  })
  .strict();
export const taskUpdate = taskCreate
  .partial()
  .extend({ version })
  .strict()
  .refine(
    (v) => Object.keys(v).length >= 1,
    "Send at least one changed field",
  );
export const taskStatus = z
  .object({ status: z.enum(STATUSES), version: version.optional() })
  .strict();
export const taskDelete = z.object({ version: version.optional() }).strict();
export const taskQuery = pageQuery
  .extend({
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    assigneeId: uuid.optional(),
    teamId: uuid.optional(),
    projectId: uuid.optional(),
    dueDate: day.optional(),
    dueFrom: day.optional(),
    dueTo: day.optional(),
    sortBy: z
      .enum([
        "dueDate",
        "createdAt",
        "updatedAt",
        "title",
        "priority",
        "status",
      ])
      .default("dueDate"),
  })
  .strict()
  .refine(
    (v) => !v.dueFrom || !v.dueTo || v.dueFrom <= v.dueTo,
    "dueFrom must be on or before dueTo",
  );
