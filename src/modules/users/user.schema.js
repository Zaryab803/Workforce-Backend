import { z } from "zod";
import {
  day,
  uuid,
  password,
  pageQuery,
  queryBoolean,
} from "../../utils/schema.js";

export const roleName = z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]);

export const userCreate = z
  .object({
    employeeCode: z.string().trim().min(2).max(30).optional(),
    name: z.string().trim().min(2).max(100),
    email: z.email().trim().toLowerCase(),
    password: password.optional(),
    phone: z.string().max(30).nullable().optional(),
    role: roleName.default("EMPLOYEE"),
    managerId: uuid.nullable().optional().or(z.literal("")),
    joiningDate: day.optional(),
    joined: day.optional(),
    employmentStatus: z
      .enum(["ACTIVE", "ON_LEAVE", "INACTIVE"])
      .default("ACTIVE"),
    position: z.string().optional(),
    avatarUrl: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    isActive: z.boolean().default(true),
    active: z.boolean().optional(),
    teamIds: z.array(uuid).max(20).default([]),
    teamId: uuid.optional().or(z.literal("")),
  });

export const userUpdate = userCreate
  .omit({ employeeCode: true })
  .extend({
    role: roleName.optional(),
    employmentStatus: z.enum(["ACTIVE", "ON_LEAVE", "INACTIVE"]).optional(),
    isActive: z.boolean().optional(),
    teamIds: z.array(uuid).max(20).optional(),
  })
  .partial();
export const userStatus = z.object({ isActive: z.boolean() }).strict();
export const userRole = z.object({ role: roleName }).strict();
export const userQuery = pageQuery
  .extend({
    role: roleName.optional(),
    teamId: uuid.optional(),
    status: z.enum(["ACTIVE", "ON_LEAVE", "INACTIVE"]).optional(),
    isActive: queryBoolean.optional(),
    sortBy: z
      .enum(["name", "email", "joiningDate", "createdAt", "joined"])
      .default("name"),
  });
