import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { idParams } from "../../utils/schema.js";
import { activityCreate, activityQuery } from "./activity.schema.js";
import { activityService } from "./activity.service.js";
import { activityController } from "./activity.controller.js";
export function activityRoutes(db) {
  const r = Router(),
    c = activityController(activityService(db));
  r.get(
    "/:id/activities",
    validate({ params: idParams, query: activityQuery }),
    c.list,
  );
  r.post(
    "/:id/activities",
    validate({ params: idParams, body: activityCreate }),
    c.create,
  );
  r.get(
    "/:id/history",
    validate({ params: idParams, query: activityQuery }),
    c.history,
  );
  return r;
}
