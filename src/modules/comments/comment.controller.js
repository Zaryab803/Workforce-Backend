import { success, paginated, requestContext } from "../../utils/response.js";
export const commentController = (s) => ({
  list: async (req, res) =>
    paginated(
      res,
      await s.list(req.user, req.validated.params.id, req.validated.query),
    ),
  create: async (req, res) =>
    success(
      res,
      await s.create(
        req.user,
        req.validated.params.id,
        req.validated.body,
        requestContext(req),
      ),
      201,
    ),
});
