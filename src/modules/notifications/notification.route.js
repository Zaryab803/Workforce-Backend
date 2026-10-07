import { env } from "../../config/env.js";
import { pushExternalId } from "../../integrations/onesignal.js";
import { success } from "../../utils/response.js";
import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { idParams } from "../../utils/schema.js";
import { notificationQuery, pushPreference } from "./notification.schema.js";
import { notificationService } from "./notification.service.js";
import { notificationController } from "./notification.controller.js";

export function notificationRoutes(db) {
  const r = Router(),
    c = notificationController(notificationService(db));

  r.get("/push-config", async (req, res) =>
    success(
      res,
      env.ONESIGNAL_ENABLED
        ? {
            enabled: true,
            appId: env.ONESIGNAL_APP_ID,
            externalId: pushExternalId(req.user.id),
            preference: (
              await db.user.findUnique({
                where: { id: req.user.id },
                select: { pushEnabled: true },
              })
            ).pushEnabled,
          }
        : { enabled: false },
    ),
  );

  r.patch(
    "/push-preference",
    validate({ body: pushPreference }),
    async (req, res) => {
      await db.user.update({
        where: { id: req.user.id },
        data: { pushEnabled: req.validated.body.enabled },
      });
      success(res, { enabled: req.validated.body.enabled });
    },
  );

  r.get("/", validate({ query: notificationQuery }), c.list);
  r.get("/unread-count", c.unread);
  r.patch("/read-all", c.readAll);
  r.patch("/all", c.readAll);
  r.patch("/:id/read", validate({ params: idParams }), c.read);
  r.patch("/:id", (req, res, next) =>
    req.params.id === "all"
      ? c.readAll(req, res, next)
      : c.read(req, res, next),
  );

  return r;
}
