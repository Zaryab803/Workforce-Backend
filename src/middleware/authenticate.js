import { verifyAccessToken } from "../modules/auth/auth.token.js";
import { assert, fail } from "../utils/errors.js";
export async function authenticateToken(db, token) {
  let claims;
  try {
    claims = verifyAccessToken(token);
  } catch (err) {
    console.error("DEBUG authenticateToken error:", err?.message || err);
    fail(
      401,
      "TOKEN_EXPIRED_OR_INVALID",
      "Your access token is expired or invalid.",
    );
  }
  assert(
    typeof claims.sub === "string" && typeof claims.sid === "string",
    401,
    "UNAUTHENTICATED",
    "Invalid token claims.",
  );
  const user = await db.user.findUnique({
    where: { id: claims.sub },
    include: { role: true },
  });
  const session = await db.refreshSession.findUnique({
    where: { id: claims.sid },
  });
  assert(
    user &&
      user.isActive &&
      !user.deletedAt &&
      user.tokenVersion === claims.tv &&
      session &&
      session.userId === user.id &&
      !session.revokedAt &&
      session.expiresAt > new Date(),
    401,
    "SESSION_REVOKED",
    "Please sign in again.",
  );
  return { id: user.id, role: user.role.name };
}
export const authenticate = (db) => async (req, res, next) => {
  const header = req.get("authorization") || "";
  assert(
    header.startsWith("Bearer "),
    401,
    "UNAUTHENTICATED",
    "Send a valid Bearer access token.",
  );
  req.user = await authenticateToken(db, header.slice(7));
  res.set("Cache-Control", "no-store");
  next();
};
