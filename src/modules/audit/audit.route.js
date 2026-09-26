import { Router } from "express";
import { authorizeRoles } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { auditQuery } from "./audit.schema.js";
import { auditService } from "./audit.service.js";
import { auditController } from "./audit.controller.js";
export function auditRoutes(db) {
  const r = Router(),
    c = auditController(auditService(db));
  r.get("/", authorizeRoles("ADMIN"), validate({ query: auditQuery }), c.list);
  return r;
}
