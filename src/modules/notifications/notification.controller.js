import { success, paginated } from "../../utils/response.js";
export const notificationController = (s) => ({
  list: async (req, res) =>
    paginated(res, await s.list(req.user, req.validated.query)),
  read: async (req, res) =>
    success(res, await s.read(req.user, req.validated.params.id)),
  readAll: async (req, res) => success(res, await s.readAll(req.user)),
  unread: async (req, res) => success(res, await s.unread(req.user)),
});
