import { Server } from "socket.io";
import { z } from "zod";
import { EventEmitter } from "node:events";
import { allowedOrigins } from "../config/env.js";
import { authenticateToken } from "../middleware/authenticate.js";
import { authorizeTask } from "../middleware/authorize.js";
import { commentCreate } from "../modules/comments/comment.schema.js";
import { commentService } from "../modules/comments/comment.service.js";
import { liveChannel, currentSocketUser } from "../jobs/outbox.processor.js";
import { verifyAccessToken } from "../modules/auth/auth.token.js";
import { logger } from "../config/logger.js";
import { uuid } from "../utils/schema.js";

const taskInput = z.object({ taskId: uuid }).strict();
const createInput = commentCreate.extend({ taskId: uuid }).strict();
const safeError = (error) => ({
  ok: false,
  error: {
    code:
      error instanceof z.ZodError
        ? "VALIDATION_ERROR"
        : error.status
          ? error.code
          : "INTERNAL_ERROR",
    message: error.status ? error.message : "Request could not be completed.",
  },
});

export const realtimeBus = new EventEmitter();

let activeRedisPublisher = null;

export function publishLiveEvent(event) {
  const payload = JSON.stringify(event);
  if (activeRedisPublisher) {
    activeRedisPublisher.publish(liveChannel, payload).catch(() => {});
  }
  realtimeBus.emit("live-message", payload);
}

export async function attachRealtime(httpServer, { db, redis = null }) {
  activeRedisPublisher = redis;
  const io = new Server(httpServer, {
    transports: ["websocket", "polling"],
    maxHttpBufferSize: 16000,
    cors: { origin: (origin, cb) => cb(null, true), credentials: true },
    allowRequest: (req, callback) => callback(null, true),
  });

  const memoryLimits = new Map();
  async function checkRateLimit(key) {
    if (redis) {
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, 120);
      return count;
    }
    const count = (memoryLimits.get(key) || 0) + 1;
    memoryLimits.set(key, count);
    setTimeout(() => memoryLimits.delete(key), 60000).unref();
    return count;
  }

  io.use(async (socket, next) => {
    try {
      const rawToken =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "");
      const token = z.string().min(1).max(4096).parse(rawToken);
      socket.data.user = await authenticateToken(db, token);
      socket.data.token = token;
      next();
    } catch {
      next(new Error("UNAUTHENTICATED"));
    }
  });

  io.on("connection", (socket) => {
    socket.data.tasks = new Set();
    try {
      const verified = verifyAccessToken(socket.data.token);
      const expiry = (verified.exp || Date.now() / 1000 + 900) * 1000;
      const timer = setTimeout(
        () => socket.disconnect(true),
        Math.max(1, expiry - Date.now()),
      ).unref();
      socket.once("disconnect", () => clearTimeout(timer));
    } catch {
      socket.disconnect(true);
      return;
    }

    const handle = (name, schema, operation) =>
      socket.on(name, async (payload, ack) => {
        if (typeof ack !== "function") return;
        try {
          const key = `orbit:socket-rate:${socket.data.user.id}:${Math.floor(Date.now() / 60000)}`;
          const count = await checkRateLimit(key);
          if (count > 120)
            return ack({
              ok: false,
              error: {
                code: "RATE_LIMITED",
                message: "Please wait before sending more events.",
              },
            });
          const input = schema.parse(payload);
          const user = await currentSocketUser(db, socket);
          ack({ ok: true, data: await operation(user, input) });
        } catch (error) {
          ack(safeError(error));
        }
      });

    handle("task:subscribe", taskInput, async (user, { taskId }) => {
      await authorizeTask(db, user, taskId);
      if (socket.data.tasks.size >= 50 && !socket.data.tasks.has(taskId))
        throw Object.assign(new Error("Too many task subscriptions."), {
          status: 429,
          code: "SUBSCRIPTION_LIMIT",
        });
      socket.data.tasks.add(taskId);
      return { taskId };
    });

    handle("task:unsubscribe", taskInput, async (_user, { taskId }) => {
      socket.data.tasks.delete(taskId);
      return { taskId };
    });

    handle(
      "comment:create",
      createInput,
      async (user, { taskId, comment, clientRequestId }) => {
        const created = await commentService(db).create(
          user,
          taskId,
          { comment, clientRequestId },
          { ip: socket.handshake.address, userAgent: "socket.io" },
        );
        publishLiveEvent({
          kind: "COMMENT_LIVE",
          taskId,
          commentId: created.id,
          comment: created,
        });
        return created;
      },
    );
  });

  async function broadcast(message) {
    try {
      const event = typeof message === "string" ? JSON.parse(message) : message;
      for (const socket of io.sockets.sockets.values()) {
        if (!socket.data?.user) continue;

        if (
          event.kind === "NOTIFICATION_LIVE" &&
          event.userId &&
          socket.data.user.id !== event.userId
        ) {
          continue;
        }

        if (event.kind === "COMMENT_LIVE") {
          socket.emit("comment:created", {
            taskId: event.taskId,
            commentId: event.commentId,
            comment: event.comment,
            eventId: event.eventId,
          });
        } else if (event.kind === "NOTIFICATION_LIVE") {
          socket.emit("notification:created", {
            notificationId: event.notificationId,
            eventId: event.eventId,
          });
        } else if (event.kind === "TASK_CHANGED") {
          socket.emit("task:changed", {
            taskId: event.taskId,
            action: event.action,
          });
        }
      }
    } catch (err) {
      logger.error({ err: err.message }, "Live event delivery error");
    }
  }

  let subscriber = null;
  if (redis) {
    try {
      subscriber = redis.duplicate();
      if (subscriber.status === "wait") await subscriber.connect();
      subscriber.on("message", (_channel, message) => {
        void broadcast(message);
      });
      await subscriber.subscribe(liveChannel);
    } catch (err) {
      logger.warn({ err: err.message }, "Redis pubsub unavailable, falling back to local bus");
      subscriber = null;
    }
  }

  const busListener = (msg) => void broadcast(msg);
  realtimeBus.on("live-message", busListener);

  return {
    io,
    close: async () => {
      realtimeBus.off("live-message", busListener);
      if (subscriber) await subscriber.quit();
      await new Promise((resolve) => io.close(resolve));
    },
  };
}
