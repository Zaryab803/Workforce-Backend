import { Router } from "express";
import { authorizeRoles } from "../../middleware/authorize.js";
import { validate } from "../../middleware/validate.js";
import { idParams } from "../../utils/schema.js";
import {
  teamCreate,
  teamUpdate,
  teamQuery,
  memberBody,
  memberParams,
} from "./team.schema.js";
import { teamService } from "./team.service.js";
import { teamController } from "./team.controller.js";
export function teamRoutes(db) {
  const r = Router(),
    c = teamController(teamService(db)),
    admin = authorizeRoles("ADMIN");
  r.get("/", validate({ query: teamQuery }), c.list);
  r.post("/", admin, validate({ body: teamCreate }), c.create);
  r.get("/:id", validate({ params: idParams }), c.get);
  r.patch(
    "/:id",
    admin,
    validate({ params: idParams, body: teamUpdate }),
    c.update,
  );
  r.post(
    "/:id/members",
    admin,
    validate({ params: idParams, body: memberBody }),
    c.addMember,
  );
  r.patch("/:id/members", admin, async (req, res, next) => {
    try {
      const { userId, remove } = req.body;
      const s = teamService(db);
      if (remove) {
        await s.removeMember(req.user, req.params.id, userId, { ip: req.ip, userAgent: req.get("user-agent") });
      } else {
        await s.addMember(req.user, req.params.id, userId, { ip: req.ip, userAgent: req.get("user-agent") });
      }
      const updatedTeam = await s.get(req.user, req.params.id);
      return res.json({ success: true, data: updatedTeam });
    } catch (err) {
      next(err);
    }
  });
  r.delete(
    "/:id/members/:userId",
    admin,
    validate({ params: memberParams }),
    c.removeMember,
  );
  return r;
}
