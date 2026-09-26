import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { allowedOrigins, env } from "../config/env.js";
import { assert } from "../utils/errors.js";
export function cookieRequestGuard(req, _res, next) {
  const origin = req.get("origin");
  assert(
    !origin || allowedOrigins.includes(origin),
    403,
    "ORIGIN_NOT_ALLOWED",
    "This origin is not permitted.",
  );
  assert(
    req.get("x-csrf-protection") === "1",
    403,
    "CSRF_CHECK_FAILED",
    "Send the X-CSRF-Protection: 1 header.",
  );
  next();
}
export function createLimiter(redis, auth = false) {
  return rateLimit({
    windowMs: auth ? 15 * 60 * 1000 : 60 * 1000,
    limit: auth ? env.LOGIN_RATE_LIMIT_MAX : env.RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    ...(redis
      ? {
          store: new RedisStore({
            prefix: auth ? "orbit:limit:auth:" : "orbit:limit:api:",
            sendCommand: (...args) => redis.call(...args),
          }),
        }
      : {}),
    handler: (req, res) =>
      res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Try again later.",
          requestId: req.id,
        },
      }),
  });
}
