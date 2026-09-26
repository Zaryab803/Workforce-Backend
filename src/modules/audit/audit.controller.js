import { paginated } from "../../utils/response.js";
export const auditController = (s) => ({
  list: async (req, res) => paginated(res, await s.list(req.validated.query)),
});
