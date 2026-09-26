import { z } from "zod";
export const uuid = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid UUID",
  );
export const idParams = z.object({ id: uuid }).strict();
export const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v);
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Use a valid YYYY-MM-DD date");
export const dateValue = (v) => new Date(v + "T00:00:00.000Z");
export const password = z
  .string()
  .min(10)
  .max(72)
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number")
  .regex(/[^A-Za-z0-9]/, "Include a symbol")
  .refine(
    (v) => Buffer.byteLength(v, "utf8") <= 72,
    "Password exceeds bcrypt’s 72-byte limit",
  );
export const queryBoolean = z
  .enum(["true", "false"])
  .transform((v) => v === "true");
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});
export const version = z.number().int().positive();
export const hours = z.number().min(0.01).max(24).multipleOf(0.01);
export const nonempty = (schema) =>
  schema.refine((v) => Object.keys(v).length > 0, "Send at least one field");
