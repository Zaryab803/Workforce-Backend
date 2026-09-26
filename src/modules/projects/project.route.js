import { Router } from "express";
import { authorizeRoles } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { idParams } from "../../utils/schema.js";
import {
  projectCreate,
  projectUpdate,
  projectQuery,
} from "./project.schema.js";
import { projectService } from "./project.service.js";
import { projectController } from "./project.controller.js";
export function projectRoutes(db) {
  const r = Router(),
    c = projectController(projectService(db)),
    manage = authorizeRoles("ADMIN", "MANAGER");
  r.get("/", validate({ query: projectQuery }), c.list);
  r.post("/", manage, validate({ body: projectCreate }), c.create);
  r.get("/:id", validate({ params: idParams }), c.get);
  r.patch(
    "/:id",
    manage,
    validate({ params: idParams, body: projectUpdate }),
    c.update,
  );
  return r;
}
