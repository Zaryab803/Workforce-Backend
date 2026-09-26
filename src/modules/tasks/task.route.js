import { Router } from "express";
import { authorizeRoles } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { idParams } from "../../utils/schema.js";
import {
  taskCreate,
  taskUpdate,
  taskQuery,
  taskStatus,
  taskDelete,
} from "./task.schema.js";
import { taskService } from "./task.service.js";
import { taskController } from "./task.controller.js";
import { taskInclude, serializeTask } from "./task.repository.js";
import { success } from "../../utils/response.js";

export function taskRoutes(db) {
  const r = Router(),
    c = taskController(taskService(db)),
    manage = authorizeRoles("ADMIN", "MANAGER");

  r.get("/", validate({ query: taskQuery }), c.list);
  r.post("/", manage, validate({ body: taskCreate }), c.create);
  r.get("/:id", validate({ params: idParams }), c.get);
  r.patch(
    "/:id",
    manage,
    validate({ params: idParams, body: taskUpdate }),
    c.update,
  );
  r.patch(
    "/:id/status",
    validate({ params: idParams, body: taskStatus }),
    c.status,
  );
  r.post("/:id/hours", async (req, res, next) => {
    try {
      const hours = Number(req.body.hours || 0);
      const task = await db.task.update({
        where: { id: req.params.id },
        data: {
          actualHours: { increment: hours },
        },
        include: taskInclude,
      });
      return success(res, serializeTask(task));
    } catch (err) {
      next(err);
    }
  });
  r.delete(
    "/:id",
    manage,
    validate({ params: idParams, body: taskDelete }),
    c.remove,
  );

  return r;
}
