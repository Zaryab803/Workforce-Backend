import { z } from "zod";
export const loginSchema = z
  .object({
    email: z.email().trim().toLowerCase(),
    password: z.string().min(1).max(128),
    remember: z.boolean().default(true),
  })
  .strict();
