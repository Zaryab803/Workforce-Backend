import { success, requestContext } from "../../utils/response.js";
import { cookieName, cookieOptions } from "./auth.token.js";
export function authController(service) {
  const send = (res, value, persistent = value.persistent) => {
    res.cookie(cookieName, value.refreshToken, {
      ...cookieOptions,
      ...(persistent ? { expires: value.expiresAt } : {}),
    });
    res.set("Cache-Control", "no-store");
    return success(res, {
      user: value.user,
      accessToken: value.accessToken,
      tokenType: "Bearer",
    });
  };
  return {
    login: async (req, res) =>
      send(
        res,
        await service.login(req.validated.body, requestContext(req)),
        req.validated.body.remember,
      ),
    refresh: async (req, res) => {
      try {
        return send(
          res,
          await service.refresh(req.cookies[cookieName], requestContext(req)),
        );
      } catch (error) {
        res.clearCookie(cookieName, cookieOptions);
        throw error;
      }
    },
    logout: async (req, res) => {
      const data = await service.logout(req.cookies[cookieName]);
      res.clearCookie(cookieName, cookieOptions);
      return success(res, data);
    },
    me: async (req, res) => success(res, await service.me(req.user.id)),
  };
}
