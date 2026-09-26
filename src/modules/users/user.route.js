import { Router } from "express";
import { authorizeRoles } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { idParams } from "../../utils/schema.js";
import {
  userCreate,
  userUpdate,
  userQuery,
  userStatus,
  userRole,
} from "./user.schema.js";
import { userService } from "./user.service.js";
import { userController } from "./user.controller.js";
export function userRoutes(db) {
  const r = Router(),
    c = userController(userService(db)),
    admin = authorizeRoles("ADMIN");
  r.get(
    "/",
    authorizeRoles("ADMIN", "MANAGER"),
    validate({ query: userQuery }),
    c.list,
  );
  r.post("/", admin, validate({ body: userCreate }), c.create);
  r.get("/:id", validate({ params: idParams }), c.get);
  r.patch(
    "/:id",
    admin,
    validate({ params: idParams, body: userUpdate }),
    c.update,
  );
  r.patch(
    "/:id/status",
    admin,
    validate({ params: idParams, body: userStatus }),
    c.update,
  );
  r.patch(
    "/:id/role",
    admin,
    validate({ params: idParams, body: userRole }),
    c.update,
  );
  return r;
}
