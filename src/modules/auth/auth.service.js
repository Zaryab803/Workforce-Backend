import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { env } from "../../config/env.js";
import { assert, fail } from "../../utils/errors.js";
import { publicUserSelect, serializeUser } from "../../utils/user.js";
import { authRepository, authUserSelect } from "./auth.repository.js";
import { newRefreshToken, tokenHash, signAccessToken } from "./auth.token.js";
import { transaction } from "../../utils/transaction.js";
import { enqueueNotification } from "../../jobs/outbox.repository.js";
export function authService(db) {
  const repo = authRepository(db);
  const dummy = bcrypt.hash(randomUUID(), env.BCRYPT_ROUNDS);
  const sessionData = (
    userId,
    token,
    ctx,
    familyId = randomUUID(),
    expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86400000),
    persistent = true,
  ) => ({
    persistent,
    userId,
    familyId,
    tokenHash: tokenHash(token),
    expiresAt,
    ipAddress: ctx.ip,
    userAgent: ctx.userAgent,
  });
  const result = async (user, session, token) => ({
    user: serializeUser(
      await db.user.findUnique({
        where: { id: user.id },
        select: publicUserSelect,
      }),
    ),
    accessToken: signAccessToken(user, session.id),
    refreshToken: token,
    expiresAt: session.expiresAt,
    persistent: session.persistent,
  });
  return {
    async login(data, ctx) {
      const user = await repo.findByEmail(data.email);
      const valid =
        Boolean(user) &&
        (await bcrypt.compare(
          data.password,
          user.passwordHash || (await dummy),
        ));
      assert(
        user && valid && user.isActive && !user.deletedAt,
        401,
        "INVALID_CREDENTIALS",
        "Email or password is incorrect.",
      );
      const token = newRefreshToken();
      const session = await transaction(db, async (tx) => {
        const created = await tx.refreshSession.create({
          data: sessionData(
            user.id,
            token,
            ctx,
            undefined,
            undefined,
            data.remember,
          ),
        });
        const notification = await tx.notification.create({
          data: {
            userId: user.id,
            type: "LOGIN",
            title: "Login successful",
            message: "You have signed in successfully.",
            entityType: "User",
            entityId: user.id,
            dedupeKey: `login-${created.id}`,
          },
        });
        // This login notice uses the existing in-app/push pipeline, without email.
        await enqueueNotification(tx, notification, {
          ...env,
          EMAIL_ENABLED: false,
        });
        return created;
      });
      return result(user, session, token);
    },
    async refresh(token, ctx) {
      assert(token, 401, "UNAUTHENTICATED", "A refresh session is required.");
      const hashed = tokenHash(token);
      const nextToken = newRefreshToken();
      const outcome = await db.$transaction(async (tx) => {
        const current = await tx.refreshSession.findUnique({
          where: { tokenHash: hashed },
          include: { user: { select: authUserSelect } },
        });
        if (!current) return { invalid: true };
        if (current.revokedAt) {
          await tx.refreshSession.updateMany({
            where: { familyId: current.familyId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          return { reused: true };
        }
        if (
          current.expiresAt <= new Date() ||
          !current.user.isActive ||
          current.user.deletedAt
        ) {
          await tx.refreshSession.updateMany({
            where: { familyId: current.familyId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          return { invalid: true };
        }
        const claimed = await tx.refreshSession.updateMany({
          where: { id: current.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        if (!claimed.count) {
          await tx.refreshSession.updateMany({
            where: { familyId: current.familyId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          return { reused: true };
        }
        const session = await tx.refreshSession.create({
          data: sessionData(
            current.userId,
            nextToken,
            ctx,
            current.familyId,
            current.expiresAt,
            current.persistent,
          ),
        });
        return { session, user: current.user };
      });
      // Throw AFTER the transaction commits; otherwise reuse revocation would roll back.
      if (outcome.reused)
        fail(
          401,
          "REFRESH_TOKEN_REUSED",
          "This session was already used. Sign in again.",
        );
      assert(
        !outcome.invalid,
        401,
        "UNAUTHENTICATED",
        "Your session has expired. Sign in again.",
      );
      return result(outcome.user, outcome.session, nextToken);
    },
    async logout(token) {
      if (token)
        await db.refreshSession.updateMany({
          where: { tokenHash: tokenHash(token), revokedAt: null },
          data: { revokedAt: new Date() },
        });
      return { loggedOut: true };
    },
    async me(id) {
      const user = await db.user.findUnique({
        where: { id },
        select: publicUserSelect,
      });
      assert(user, 401, "UNAUTHENTICATED", "Please sign in again.");
      return serializeUser(user);
    },
  };
}
