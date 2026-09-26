import { success } from "../../utils/response.js";
export const dashboardController = (s) => ({
  get: async (req, res) => success(res, await s.get(req.user)),
});
