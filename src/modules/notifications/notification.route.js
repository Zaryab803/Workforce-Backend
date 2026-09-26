import { env } from "../../config/env.js";
import { pushExternalId } from "../../integrations/onesignal.js";
import { success } from "../../utils/response.js";
import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { idParams } from "../../utils/schema.js";
import { notificationQuery } from "./notification.schema.js";
import { notificationService } from "./notification.service.js";
import { notificationController } from "./notification.controller.js";

export function notificationRoutes(db) {
  const r = Router(),
    c = notificationController(notificationService(db));

  r.get("/push-config", (req, res) =>
    success(
      res,
      env.ONESIGNAL_ENABLED
        ? {
            enabled: true,
            appId: env.ONESIGNAL_APP_ID,
            externalId: pushExternalId(req.user.id),
          }
        : { enabled: false },
    ),
  );

  r.get("/", validate({ query: notificationQuery }), c.list);
  r.get("/unread-count", c.unread);
  r.patch("/read-all", c.readAll);
  r.patch("/all", c.readAll);
  r.patch("/:id/read", validate({ params: idParams }), c.read);
  r.patch("/:id", (req, res, next) =>
    req.params.id === "all" ? c.readAll(req, res, next) : c.read(req, res, next),
  );

  return r;
}
