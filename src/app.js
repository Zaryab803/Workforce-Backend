import { randomUUID } from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import swaggerUi from "swagger-ui-express";
import { env, allowedOrigins } from "./config/env.js";
import { logger } from "./config/logger.js";
import { AppError } from "./utils/errors.js";
import { errorHandler } from "./middleware/error-handler.js";
import { authenticate as authMiddleware } from "./middleware/authenticate.js";
import { createLimiter } from "./middleware/security.js";
import { authorizeRoles } from "./middleware/authorize.js";
import { authRoutes } from "./modules/auth/auth.route.js";
import { userRoutes } from "./modules/users/user.route.js";
import { teamRoutes } from "./modules/teams/team.route.js";
import { projectRoutes } from "./modules/projects/project.route.js";
import { taskRoutes } from "./modules/tasks/task.route.js";
import { commentRoutes } from "./modules/comments/comment.route.js";
import { activityRoutes } from "./modules/activities/activity.route.js";
import { notificationRoutes } from "./modules/notifications/notification.route.js";
import { auditRoutes } from "./modules/audit/audit.route.js";
import { dashboardRoutes } from "./modules/dashboard/dashboard.route.js";
import { roleRoutes } from "./modules/roles/role.route.js";
import { openapi } from "./docs/openapi.js";
export function createApp({ db, redis = null }) {
  const app = express();
  app.disable("x-powered-by");
  app.disable("etag");
  app.set("trust proxy", env.TRUST_PROXY_HOPS);
  app.use((req, res, next) => {
    req.id = randomUUID();
    res.set("X-Request-ID", req.id);
    next();
  });
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      serializers: {
        req: (req) => ({
          id: req.id,
          method: req.method,
          path: req.url?.split("?")[0],
        }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) =>
        !origin || allowedOrigins.includes(origin)
          ? cb(null, true)
          : cb(
              new AppError(
                403,
                "ORIGIN_NOT_ALLOWED",
                "This origin is not permitted.",
              ),
            ),
      credentials: true,
      methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Protection"],
      exposedHeaders: ["X-Request-ID", "RateLimit", "RateLimit-Policy"],
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use("/api", createLimiter(redis));
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/ready", async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      if (redis) await redis.ping();
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
  app.get("/api/openapi.json", (_req, res) => res.json(openapi));
  app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(openapi, {
      customSiteTitle: "Orbit Workforce API",
      swaggerOptions: { persistAuthorization: false },
    }),
  );
  app.get("/", (_req, res) => res.redirect("/api/docs"));
  const authenticate = authMiddleware(db);
  app.use(
    "/api/v1/auth",
    authRoutes(db, authenticate, createLimiter(redis, true)),
  );
  app.use("/api/v1", authenticate);
  app.use("/api/v1/users", userRoutes(db));
  app.use("/api/v1/employees", userRoutes(db));

  app.get("/api/v1/lookups", async (req, res, next) => {
    try {
      const users = await db.user.findMany({
        where: { deletedAt: null, isActive: true },
        include: { role: true, memberships: true },
      });
      const teams = await db.team.findMany();
      const projects = await db.project.findMany({ where: { status: "ACTIVE" } });

      res.json({
        success: true,
        data: {
          employees: users.map((u) => ({
            id: u.id,
            name: u.name,
            role: u.role.name,
            teamId: u.memberships[0]?.teamId || "",
            avatar: u.avatarUrl || "",
          })),
          teams: teams.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description || "",
            managerId: t.managerId,
            color: t.color || "#6366f1",
          })),
          projects: projects.map((p) => p.name),
        },
      });
    } catch (err) {
      next(err);
    }
  });

  app.use("/api/v1/teams", teamRoutes(db));
  app.use("/api/v1/projects", projectRoutes(db));
  app.use(
    "/api/v1/tasks",
    commentRoutes(db),
    activityRoutes(db),
    taskRoutes(db),
  );
  app.use("/api/v1/notifications", notificationRoutes(db));
  app.use("/api/v1/audit-logs", auditRoutes(db));
  app.use("/api/v1/dashboard", dashboardRoutes(db));
  app.use(
    "/api/v1/reports",
    authorizeRoles("ADMIN", "MANAGER"),
    dashboardRoutes(db),
  );
  app.use("/api/v1/roles", roleRoutes(db));
  app.use((_req, _res, next) =>
    next(new AppError(404, "NOT_FOUND", "This endpoint does not exist.")),
  );
  app.use(errorHandler);
  return app;
}
