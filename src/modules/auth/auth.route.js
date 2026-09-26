import { Router } from "express";
import { authController } from "./auth.controller.js";
import { authService } from "./auth.service.js";
import { validate } from "../../middleware/validate.js";
import { cookieRequestGuard } from "../../middleware/security.js";
import { loginSchema } from "./auth.schema.js";
export function authRoutes(db, authenticate, limiter) {
  const r = Router();
  const c = authController(authService(db));
  r.post(
    "/login",
    limiter,
    cookieRequestGuard,
    validate({ body: loginSchema }),
    c.login,
  );
  r.post("/refresh", limiter, cookieRequestGuard, c.refresh);
  r.post("/logout", cookieRequestGuard, c.logout);
  r.get("/me", authenticate, c.me);
  return r;
}
