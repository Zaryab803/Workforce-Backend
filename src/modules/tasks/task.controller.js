import { success, paginated, requestContext } from "../../utils/response.js";
export const taskController = (s) => ({
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
  status: async (req, res) =>
    success(
      res,
      await s.status(
        req.user,
        req.validated.params.id,
        req.validated.body,
        requestContext(req),
      ),
    ),
  remove: async (req, res) =>
    success(
      res,
      await s.remove(
        req.user,
        req.validated.params.id,
        req.validated.body.version,
        requestContext(req),
      ),
    ),
});
