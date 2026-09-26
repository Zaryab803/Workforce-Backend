import { Router } from "express";
import { authorizeRoles } from "../../middleware/authorize.js";
import { success } from "../../utils/response.js";
export const permissions = {
  ADMIN: [
    "users:manage",
    "teams:manage",
    "projects:manage",
    "tasks:manage",
    "reports:all",
    "audit:read",
  ],
  MANAGER: [
    "users:team:read",
    "teams:managed:read",
    "projects:team:manage",
    "tasks:team:manage",
    "reports:team",
  ],
  EMPLOYEE: [
    "tasks:assigned:read",
    "tasks:assigned:status",
    "tasks:assigned:comment",
    "tasks:assigned:log-time",
  ],
};
export function roleRoutes(db) {
  const r = Router();
  r.get("/", authorizeRoles("ADMIN"), async (_req, res) =>
    success(
      res,
      (await db.role.findMany({ orderBy: { name: "asc" } })).map((role) => ({
        ...role,
        permissions: permissions[role.name],
      })),
    ),
  );
  return r;
}
