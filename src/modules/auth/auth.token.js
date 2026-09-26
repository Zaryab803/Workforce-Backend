import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
export const tokenHash = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
export const newRefreshToken = () =>
  crypto.randomBytes(48).toString("base64url");
export const signAccessToken = (user, sessionId) =>
  jwt.sign({ sid: sessionId, tv: user.tokenVersion }, env.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    subject: user.id,
    jwtid: crypto.randomUUID(),
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
export const verifyAccessToken = (token) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ["HS256"],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
export const cookieName = "orbit_refresh";
export const cookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAME_SITE,
  path: "/api/v1/auth",
};
