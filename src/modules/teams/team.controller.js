import { success, paginated, requestContext } from "../../utils/response.js";
export const teamController = (s) => ({
  list: async (req, res) =>
    paginated(res, await s.list(req.user, req.validated.query)),
  get: async (req, res) =>
    success(res, await s.get(req.user, req.validated.params.id)),
  create: async (req, res) =>
    success(
      res,
      await s.create(req.user, req.validated.body, requestContext(req)),
      201,
    ),
  update: async (req, res) =>
    success(
      res,
      await s.update(
        req.user,
        req.validated.params.id,
        req.validated.body,
        requestContext(req),
      ),
    ),
  addMember: async (req, res) =>
    success(
      res,
      await s.addMember(
        req.user,
        req.validated.params.id,
        req.validated.body.userId,
        requestContext(req),
      ),
      201,
    ),
  removeMember: async (req, res) =>
    success(
      res,
      await s.removeMember(
        req.user,
        req.validated.params.id,
        req.validated.params.userId,
        requestContext(req),
      ),
    ),
});
