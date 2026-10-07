import { env } from "../../src/config/env.js";
import {
  createPushSender,
  pushExternalId,
} from "../../src/integrations/onesignal.js";
import { startWorkers } from "../../src/workers/start-workers.js";
import { createServer } from "node:http";
import { io as socketClient } from "socket.io-client";
import { attachRealtime } from "../../src/realtime/server.js";
import {
  createOutboxDelivery,
  processOutbox,
} from "../../src/jobs/outbox.processor.js";
import { enqueueNotification } from "../../src/jobs/outbox.repository.js";
import {
  beforeAll,
  afterAll,
  test,
  expect,
  describe,
  jest,
} from "@jest/globals";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import request from "supertest";
import { Queue, Worker, QueueEvents } from "bullmq";
import Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { createApp } from "../../src/app.js";
import {
  deliverOverdue,
  processOverdue,
} from "../../src/jobs/overdue.processor.js";
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (
  process.env.NODE_ENV !== "test" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !url.searchParams.get("schema")?.endsWith("_test")
)
  throw new Error(
    "Integration tests require NODE_ENV=test and a localhost database schema ending in _test.",
  );
const db = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
const app = createApp({ db, redis });
let admin,
  manager,
  employee,
  otherManager,
  otherEmployee,
  team,
  otherTeam,
  project,
  otherProject,
  task,
  otherTask;
const password = "IntegrationPass123!";
let a, m, e;
const auth = (token) => ({ Authorization: "Bearer " + token });
const cookie = (res) =>
  (res.headers["set-cookie"] || [])
    .find((v) => v.startsWith("orbit_refresh="))
    ?.split(";")[0];
async function login(email) {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .set("X-CSRF-Protection", "1")
    .send({ email, password });
  expect(res.status).toBe(200);
  return {
    token: res.body.data.accessToken,
    cookie: cookie(res),
    user: res.body.data.user,
  };
}
async function createTask(title = "Integration task") {
  const res = await request(app).post("/api/v1/tasks").set(auth(m.token)).send({
    title,
    description: "Test work",
    projectId: project.id,
    assigneeId: employee.id,
    priority: "HIGH",
    dueDate: "2026-01-01",
    estimatedHours: 8,
  });
  expect(res.status).toBe(201);
  return res.body.data;
}
beforeAll(async () => {
  await db.$connect();
  const suffix = randomUUID().slice(0, 8);
  for (const name of ["ADMIN", "MANAGER", "EMPLOYEE"])
    await db.role.upsert({ where: { name }, update: {}, create: { name } });
  const roles = Object.fromEntries(
    (await db.role.findMany()).map((r) => [r.name, r.id]),
  );
  const hash = await bcrypt.hash(password, 10);
  const user = (name, role) =>
    db.user.create({
      data: {
        name,
        email: `${name.toLowerCase()}-${suffix}@test.local`,
        employeeCode: `${name}-${suffix}`,
        passwordHash: hash,
        roleId: roles[role],
        joiningDate: new Date("2026-01-01"),
      },
    });
  admin = await user("Admin", "ADMIN");
  manager = await user("Manager", "MANAGER");
  employee = await user("Employee", "EMPLOYEE");
  otherManager = await user("OtherManager", "MANAGER");
  otherEmployee = await user("OtherEmployee", "EMPLOYEE");
  team = await db.team.create({
    data: { name: "Design-" + suffix, managerId: manager.id },
  });
  otherTeam = await db.team.create({
    data: { name: "Engineering-" + suffix, managerId: otherManager.id },
  });
  await db.teamMember.createMany({
    data: [
      { teamId: team.id, userId: employee.id },
      { teamId: otherTeam.id, userId: otherEmployee.id },
    ],
  });
  project = await db.project.create({
    data: { name: "Project " + suffix, teamId: team.id, createdBy: manager.id },
  });
  otherProject = await db.project.create({
    data: {
      name: "Other project " + suffix,
      teamId: otherTeam.id,
      createdBy: otherManager.id,
    },
  });
  otherTask = await db.task.create({
    data: {
      title: "Out of scope",
      projectId: otherProject.id,
      teamId: otherTeam.id,
      assigneeId: otherEmployee.id,
      createdBy: otherManager.id,
      dueDate: new Date("2026-01-01"),
      estimatedHours: 4,
    },
  });
  a = await login(admin.email);
  m = await login(manager.email);
  e = await login(employee.email);
  task = await createTask();
}, 60000);
afterAll(async () => {
  await db.$disconnect();
  await redis.quit();
});
describe("authentication and request security", () => {
  test("successful login records one self notification and targeted push; failure and refresh do not", async () => {
    const previousPush = env.ONESIGNAL_ENABLED;
    const previousEmail = env.EMAIL_ENABLED;
    const where = { userId: otherEmployee.id, type: "LOGIN" };
    const before = await db.notification.count({ where });
    try {
      env.ONESIGNAL_ENABLED = true;
      env.EMAIL_ENABLED = true;
      const signedIn = await login(otherEmployee.email);
      expect(await db.notification.count({ where })).toBe(before + 1);
      const notice = await db.notification.findFirst({
        where,
        orderBy: { createdAt: "desc" },
      });
      expect(notice).toMatchObject({
        userId: otherEmployee.id,
        title: "Login successful",
        message: "You have signed in successfully.",
        entityType: "User",
        entityId: otherEmployee.id,
        isRead: false,
      });
      const events = await db.outboxEvent.findMany({
        where: { payload: { path: ["notificationId"], equals: notice.id } },
      });
      expect(events.map((event) => event.kind).sort()).toEqual([
        "NOTIFICATION_LIVE",
        "PUSH",
      ]);
      const list = await request(app)
        .get("/api/v1/notifications")
        .set(auth(signedIn.token));
      expect(list.body.data.find((item) => item.id === notice.id).taskId).toBe(
        "",
      );
      const failed = await request(app)
        .post("/api/v1/auth/login")
        .set("X-CSRF-Protection", "1")
        .send({ email: otherEmployee.email, password: "wrong-password" });
      expect(failed.status).toBe(401);
      const refreshed = await request(app)
        .post("/api/v1/auth/refresh")
        .set("X-CSRF-Protection", "1")
        .set("Cookie", signedIn.cookie);
      expect(refreshed.status).toBe(200);
      expect(await db.notification.count({ where })).toBe(before + 1);
    } finally {
      env.ONESIGNAL_ENABLED = previousPush;
      env.EMAIL_ENABLED = previousEmail;
    }
  });
  test("password hashes are never returned", async () => {
    const res = await request(app).get("/api/v1/users").set(auth(a.token));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(
      /passwordHash|tokenHash|tokenVersion/,
    );
  });
  test("rejects unauthenticated requests", async () =>
    expect((await request(app).get("/api/v1/tasks")).status).toBe(401));
  test("uses generic invalid credential responses", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("X-CSRF-Protection", "1")
      .send({ email: employee.email, password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });
  test.each(["Demo123!", "admin123", "OrbitDemo2026!"])(
    "demo password %s cannot bypass the account password hash",
    async (candidate) => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .set("X-CSRF-Protection", "1")
        .send({ email: employee.email, password: candidate });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
    },
  );
  test("blocks missing CSRF header and disallowed origins", async () => {
    expect(
      (
        await request(app)
          .post("/api/v1/auth/login")
          .send({ email: employee.email, password })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post("/api/v1/auth/refresh")
          .set("Origin", "https://evil.example")
          .set("X-CSRF-Protection", "1")
          .set("Cookie", e.cookie)
      ).status,
    ).toBe(403);
  });
  test("rotates refresh, detects replay, and revokes the family", async () => {
    const original = await login(employee.email);
    const refresh = await request(app)
      .post("/api/v1/auth/refresh")
      .set("X-CSRF-Protection", "1")
      .set("Cookie", original.cookie);
    expect(refresh.status).toBe(200);
    expect(cookie(refresh)).not.toBe(original.cookie);
    const replay = await request(app)
      .post("/api/v1/auth/refresh")
      .set("X-CSRF-Protection", "1")
      .set("Cookie", original.cookie);
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("REFRESH_TOKEN_REUSED");
    expect(
      (
        await request(app)
          .get("/api/v1/auth/me")
          .set(auth(refresh.body.data.accessToken))
      ).status,
    ).toBe(401);
  });
  test("logout revokes access and refresh", async () => {
    const session = await login(employee.email);
    expect(
      (
        await request(app)
          .post("/api/v1/auth/logout")
          .set("X-CSRF-Protection", "1")
          .set("Cookie", session.cookie)
      ).status,
    ).toBe(200);
    expect(
      (await request(app).get("/api/v1/auth/me").set(auth(session.token)))
        .status,
    ).toBe(401);
  });
  test("returns consistent validation and malformed JSON errors", async () => {
    const invalid = await request(app)
      .get("/api/v1/tasks?limit=101")
      .set(auth(a.token));
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("INVALID_INPUT");
    const malformed = await request(app)
      .post("/api/v1/tasks")
      .set(auth(a.token))
      .set("Content-Type", "application/json")
      .send("{");
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe("INVALID_JSON");
  });
});
describe("task RBAC, workflow, and transactions", () => {
  test("employee cannot create tasks or change protected fields", async () => {
    expect(
      (await request(app).post("/api/v1/tasks").set(auth(e.token)).send({}))
        .status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch("/api/v1/tasks/" + task.id)
          .set(auth(e.token))
          .send({ version: 1, title: "Attempt" })
      ).status,
    ).toBe(403);
  });
  test("manager and employee cannot access another team’s task", async () => {
    for (const token of [m.token, e.token])
      expect(
        (
          await request(app)
            .get("/api/v1/tasks/" + otherTask.id)
            .set(auth(token))
        ).status,
      ).toBe(403);
  });
  test("manager cannot assign another team’s employee", async () => {
    const res = await request(app)
      .post("/api/v1/tasks")
      .set(auth(m.token))
      .send({
        title: "Invalid assignment",
        projectId: project.id,
        assigneeId: otherEmployee.id,
        dueDate: "2026-10-01",
        estimatedHours: 4,
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_ASSIGNEE");
  });
  test("filters and paginates in the database with scoped results", async () => {
    const res = await request(app)
      .get("/api/v1/tasks?limit=1&status=TODO&search=Integration")
      .set(auth(e.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].assigneeId).toBe(employee.id);
    expect(res.body.meta.limit).toBe(1);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
  });
  test("rejects stale writes and records one status change", async () => {
    const res = await request(app)
      .patch("/api/v1/tasks/" + task.id + "/status")
      .set(auth(e.token))
      .send({ status: "IN_PROGRESS", version: 1 });
    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe(2);
    const stale = await request(app)
      .patch("/api/v1/tasks/" + task.id + "/status")
      .set(auth(e.token))
      .send({ status: "IN_REVIEW", version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("TASK_VERSION_CONFLICT");
    expect(
      await db.taskStatusHistory.count({ where: { taskId: task.id } }),
    ).toBe(2);
  });
  test("simultaneous updates produce one success and one conflict", async () => {
    const t = await createTask("Concurrent task");
    const responses = await Promise.all(
      ["First writer", "Second writer"].map((title) =>
        request(app)
          .patch("/api/v1/tasks/" + t.id)
          .set(auth(m.token))
          .send({ version: 1, title }),
      ),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await db.task.findUnique({ where: { id: t.id } })).version).toBe(2);
  });
  test("rolls back a rejected transition without audit/history writes", async () => {
    const before = await db.auditLog.count({ where: { entityId: task.id } });
    const res = await request(app)
      .patch("/api/v1/tasks/" + task.id + "/status")
      .set(auth(e.token))
      .send({ status: "COMPLETED", version: 2 });
    expect([403, 409]).toContain(res.status);
    expect(await db.auditLog.count({ where: { entityId: task.id } })).toBe(
      before,
    );
    expect((await db.task.findUnique({ where: { id: task.id } })).version).toBe(
      2,
    );
  });
  test("comments require task access", async () => {
    const ok = await request(app)
      .post("/api/v1/tasks/" + task.id + "/comments")
      .set(auth(e.token))
      .send({ comment: "Started the work." });
    expect(ok.status).toBe(201);
    expect(ok.body.data.author.id).toBe(employee.id);
    expect(
      (
        await request(app)
          .post("/api/v1/tasks/" + otherTask.id + "/comments")
          .set(auth(e.token))
          .send({ comment: "Forbidden" })
      ).status,
    ).toBe(403);
  });
  test("work logs update actual hours and version atomically", async () => {
    const res = await request(app)
      .post("/api/v1/tasks/" + task.id + "/activities")
      .set(auth(e.token))
      .send({
        description: "Implementation work",
        hours: 2.5,
        activityDate: "2026-01-01",
        version: 2,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.taskVersion).toBe(3);
    const t = await db.task.findUnique({ where: { id: task.id } });
    expect(Number(t.actualHours)).toBe(2.5);
    expect(t.version).toBe(3);
  });
  test("employee submits review; manager approves completion", async () => {
    expect(
      (
        await request(app)
          .patch("/api/v1/tasks/" + task.id + "/status")
          .set(auth(e.token))
          .send({ status: "IN_REVIEW", version: 3 })
      ).status,
    ).toBe(200);
    const denied = await request(app)
      .patch("/api/v1/tasks/" + task.id + "/status")
      .set(auth(e.token))
      .send({ status: "COMPLETED", version: 4 });
    expect(denied.status).toBe(403);
    expect(
      (
        await request(app)
          .patch("/api/v1/tasks/" + task.id + "/status")
          .set(auth(m.token))
          .send({ status: "COMPLETED", version: 4 })
      ).status,
    ).toBe(200);
  });
  test("soft-delete hides tasks and preserves audit history", async () => {
    const t = await createTask("Delete example");
    expect(
      (
        await request(app)
          .delete("/api/v1/tasks/" + t.id)
          .set(auth(m.token))
          .send({ version: 1 })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .get("/api/v1/tasks/" + t.id)
          .set(auth(m.token))
      ).status,
    ).toBe(404);
    expect(await db.auditLog.count({ where: { entityId: t.id } })).toBe(2);
  });
});
describe("teams, roles, reporting, and audit", () => {
  test("admin can create employees and hashes passwords", async () => {
    const res = await request(app)
      .post("/api/v1/users")
      .set(auth(a.token))
      .send({
        employeeCode: randomUUID().slice(0, 20),
        name: "New employee",
        email: randomUUID() + "@test.local",
        password,
        role: "EMPLOYEE",
        teamIds: [team.id],
        joiningDate: "2026-01-01",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.teamIds).toEqual([team.id]);
    expect(res.body.data.passwordHash).toBeUndefined();
    const saved = await db.user.findUnique({ where: { id: res.body.data.id } });
    expect(await bcrypt.compare(password, saved.passwordHash)).toBe(true);
  });
  test("team creation and membership are admin-only", async () => {
    expect(
      (
        await request(app)
          .post("/api/v1/teams")
          .set(auth(m.token))
          .send({ name: "Denied", managerId: manager.id })
      ).status,
    ).toBe(403);
    const res = await request(app)
      .post("/api/v1/teams")
      .set(auth(a.token))
      .send({ name: "Added " + randomUUID(), managerId: manager.id });
    expect(res.status).toBe(201);
    expect(
      (
        await request(app)
          .post("/api/v1/teams/" + res.body.data.id + "/members")
          .set(auth(a.token))
          .send({ userId: employee.id })
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app)
          .delete(
            "/api/v1/teams/" + res.body.data.id + "/members/" + employee.id,
          )
          .set(auth(a.token))
      ).status,
    ).toBe(200);
  });
  test("projects are team scoped", async () => {
    const res = await request(app)
      .post("/api/v1/projects")
      .set(auth(m.token))
      .send({ name: "Another " + randomUUID(), teamId: team.id });
    expect(res.status).toBe(201);
    expect(
      (
        await request(app)
          .post("/api/v1/projects")
          .set(auth(m.token))
          .send({ name: "Denied", teamId: otherTeam.id })
      ).status,
    ).toBe(403);
  });
  test("notifications cannot be modified by another user", async () => {
    const note = await db.notification.findFirst({
      where: { userId: employee.id },
    });
    expect(
      (
        await request(app)
          .patch("/api/v1/notifications/" + note.id + "/read")
          .set(auth(m.token))
      ).status,
    ).toBe(404);
    expect(
      (
        await request(app)
          .patch("/api/v1/notifications/" + note.id + "/read")
          .set(auth(e.token))
      ).status,
    ).toBe(200);
  });
  test("dashboard counts are scoped and manager reports are allowed", async () => {
    const res = await request(app).get("/api/v1/dashboard").set(auth(e.token));
    expect(res.status).toBe(200);
    expect(res.body.data.totalTasks).toBe(
      await db.task.count({
        where: { assigneeId: employee.id, deletedAt: null },
      }),
    );
    expect(
      (await request(app).get("/api/v1/reports").set(auth(m.token))).status,
    ).toBe(200);
    expect(
      (await request(app).get("/api/v1/reports").set(auth(e.token))).status,
    ).toBe(403);
  });
  test("audit API is admin-only and SQL updates are blocked", async () => {
    expect(
      (await request(app).get("/api/v1/audit-logs").set(auth(m.token))).status,
    ).toBe(403);
    const res = await request(app)
      .get("/api/v1/audit-logs?limit=1")
      .set(auth(a.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    await expect(
      db.$transaction((tx) =>
        tx.auditLog.update({
          where: { id: res.body.data[0].id },
          data: { action: "TAMPERED" },
        }),
      ),
    ).rejects.toThrow();
  });
  test("deactivating an employee invalidates existing sessions", async () => {
    const old = await login(otherEmployee.email);
    expect(
      (
        await request(app)
          .patch("/api/v1/users/" + otherEmployee.id + "/status")
          .set(auth(a.token))
          .send({ isActive: false })
      ).status,
    ).toBe(200);
    expect(
      (await request(app).get("/api/v1/auth/me").set(auth(old.token))).status,
    ).toBe(401);
  });
});
describe("transaction integrity", () => {
  test("an audit insert failure rolls back the task write", async () => {
    const task = await createTask("Rollback target");
    // Intentional fault injection in the isolated localhost test database.
    await db.$executeRawUnsafe(
      `CREATE FUNCTION test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected audit failure'; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER test_reject_audit BEFORE INSERT ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION test_reject_audit()`,
    );
    try {
      const res = await request(app)
        .patch("/api/v1/tasks/" + task.id)
        .set(auth(m.token))
        .send({ title: "Must roll back", version: task.version });
      expect(res.status).toBe(500);
      const stored = await db.task.findUnique({ where: { id: task.id } });
      expect(stored.title).toBe(task.title);
      expect(stored.version).toBe(task.version);
    } finally {
      await db.$executeRawUnsafe(
        `DROP TRIGGER test_reject_audit ON "audit_logs"`,
      );
      await db.$executeRawUnsafe(`DROP FUNCTION test_reject_audit()`);
    }
  });
});
describe("background jobs with real Redis", () => {
  test("daily scan enqueues overdue tasks; delivery is idempotent", async () => {
    const t = await createTask("Overdue worker test");
    const qname = "test-notify-" + randomUUID();
    const queue = new Queue(qname, { connection: redis });
    const events = new QueueEvents(qname, { connection: redis });
    const worker = new Worker(qname, (job) => deliverOverdue(db, job.data), {
      connection: redis,
      concurrency: 1,
    });
    try {
      await events.waitUntilReady();
      const day = "2026-12-01";
      const result = await processOverdue(db, queue, day);
      expect(result.queued).toBeGreaterThan(0);
      const job = await queue.getJob(`overdue-${day}-${t.id}-${employee.id}`);
      await job.waitUntilFinished(events, 15000);
      await deliverOverdue(db, { taskId: t.id, userId: employee.id, day });
      expect(
        await db.notification.count({
          where: { dedupeKey: `overdue-${day}-${t.id}-${employee.id}` },
        }),
      ).toBe(1);
    } finally {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  }, 30000);
  test("BullMQ retries a transient failure", async () => {
    const qname = "test-retry-" + randomUUID();
    const queue = new Queue(qname, { connection: redis });
    const events = new QueueEvents(qname, { connection: redis });
    const worker = new Worker(
      qname,
      async (job) => {
        if (job.attemptsMade === 0) throw new Error("Transient test failure");
        return "recovered";
      },
      { connection: redis },
    );
    try {
      await events.waitUntilReady();
      const job = await queue.add(
        "retry",
        {},
        { attempts: 2, backoff: { type: "fixed", delay: 50 } },
      );
      expect(await job.waitUntilFinished(events, 15000)).toBe("recovered");
      expect((await queue.getJob(job.id)).attemptsMade).toBe(2);
    } finally {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  }, 30000);
});

describe("durable delivery and real-time comments", () => {
  let httpServer, live, employeeSocket, managerSocket, outsiderSocket;
  const emit = (socket, event, payload) =>
    socket.timeout(5000).emitWithAck(event, payload);
  const connect = async (token) => {
    const socket = socketClient(
      `http://127.0.0.1:${httpServer.address().port}`,
      {
        transports: ["websocket"],
        auth: { token },
        reconnection: false,
        extraHeaders: { Origin: "http://localhost:3000" },
      },
    );
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    return socket;
  };
  beforeAll(async () => {
    httpServer = createServer(app);
    live = await attachRealtime(httpServer, { db, redis });
    await new Promise((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
    employeeSocket = await connect((await login(employee.email)).token);
    managerSocket = await connect((await login(manager.email)).token);
    outsiderSocket = await connect((await login(otherManager.email)).token);
  });
  afterAll(async () => {
    employeeSocket?.disconnect();
    managerSocket?.disconnect();
    outsiderSocket?.disconnect();
    await live?.close();
  });
  test("rejects unauthenticated socket connections", async () => {
    const socket = socketClient(
      `http://127.0.0.1:${httpServer.address().port}`,
      {
        transports: ["websocket"],
        auth: { token: "invalid" },
        reconnection: false,
      },
    );
    try {
      expect(
        await new Promise((resolve) =>
          socket.once("connect_error", (err) => resolve(err.message)),
        ),
      ).toBe("UNAUTHENTICATED");
    } finally {
      socket.disconnect();
    }
  });
  test("cross-team subscription and socket comment creation are rejected", async () => {
    expect(
      await emit(outsiderSocket, "task:subscribe", { taskId: task.id }),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(
      await emit(outsiderSocket, "comment:create", {
        taskId: task.id,
        comment: "Denied",
      }),
    ).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });
  test("saved socket comment is delivered to the subscribed manager and creates a manager notification", async () => {
    expect(
      (await emit(managerSocket, "task:subscribe", { taskId: task.id })).ok,
    ).toBe(true);
    const created = await emit(employeeSocket, "comment:create", {
      taskId: task.id,
      comment: "Socket message persisted",
    });
    expect(created.ok).toBe(true);
    expect(
      await db.taskComment.findUnique({ where: { id: created.data.id } }),
    ).not.toBeNull();
    const event = await db.outboxEvent.findUnique({
      where: { key: `comment-${created.data.id}` },
    });
    expect(event).not.toBeNull();
    const incoming = new Promise((resolve) =>
      managerSocket.once("comment:created", resolve),
    );
    await createOutboxDelivery(db, redis)(event);
    expect(await incoming).toMatchObject({
      taskId: task.id,
      commentId: created.data.id,
    });
    expect(
      await db.notification.findFirst({
        where: {
          userId: manager.id,
          entityId: task.id,
          type: "TASK_COMMENTED",
        },
      }),
    ).not.toBeNull();
  });
  test("REST comments use the same persisted broadcast path", async () => {
    const result = await request(app)
      .post(`/api/v1/tasks/${task.id}/comments`)
      .set(auth(m.token))
      .send({ comment: "REST live message" });
    expect(result.status).toBe(201);
    expect(
      (await emit(employeeSocket, "task:subscribe", { taskId: task.id })).ok,
    ).toBe(true);
    const event = await db.outboxEvent.findUnique({
      where: { key: `comment-${result.body.data.id}` },
    });
    const incoming = new Promise((resolve) =>
      employeeSocket.once("comment:created", resolve),
    );
    await createOutboxDelivery(db, redis)(event);
    expect((await incoming).commentId).toBe(result.body.data.id);
  });
  test("notification updates only reach the recipient's socket", async () => {
    const note = await db.notification.findFirst({
      where: { userId: employee.id },
    });
    const event = await db.outboxEvent.findUnique({
      where: { key: `live-${note.id}` },
    });
    const incoming = new Promise((resolve) =>
      employeeSocket.once("notification:created", resolve),
    );
    const seen = [];
    const listener = (data) => seen.push(data);
    outsiderSocket.on("notification:created", listener);
    await createOutboxDelivery(db, redis)(event);
    expect((await incoming).notificationId).toBe(note.id);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(seen).toEqual([]);
    outsiderSocket.off("notification:created", listener);
  });
  test("an expired lease recovers and transient delivery retries without recreating the event", async () => {
    const future = new Date(Date.now() + 1000000);
    const event = await db.outboxEvent.create({
      data: {
        key: randomUUID(),
        kind: "EMAIL",
        payload: {},
        availableAt: future,
        lockedUntil: new Date(0),
        lockToken: randomUUID(),
      },
    });
    // Other pending rows are intentionally processed by this isolated test delivery function.
    const deliver = async (row) => {
      if (row.id === event.id)
        throw Object.assign(new Error("Temporary outage"), {
          code: "ETIMEDOUT",
        });
      return "test";
    };
    await processOutbox(db, deliver, { now: future, limit: 1000 });
    let saved = await db.outboxEvent.findUnique({ where: { id: event.id } });
    expect(saved.processedAt).toBeNull();
    expect(saved.attempts).toBe(1);
    expect(saved.failedAt).toBeNull();
    await processOutbox(db, async () => "accepted", {
      now: new Date(Date.now() + 2000000),
      limit: 1000,
    });
    saved = await db.outboxEvent.findUnique({ where: { id: event.id } });
    expect(saved.result).toBe("accepted");
    expect(saved.attempts).toBe(2);
  });
  test("permanent provider failures remain visible for operator retry", async () => {
    const event = await db.outboxEvent.create({
      data: { key: randomUUID(), kind: "PUSH", payload: {} },
    });
    await processOutbox(db, async () => {
      throw Object.assign(new Error("bad key"), {
        code: "ONESIGNAL_HTTP_401",
        permanent: true,
      });
    });
    const saved = await db.outboxEvent.findUnique({ where: { id: event.id } });
    expect(saved.failedAt).not.toBeNull();
    expect(saved.processedAt).toBeNull();
    expect(saved.lastError).toBe("ONESIGNAL_HTTP_401");
  });
  test("a rolled-back notification leaves no delivery events", async () => {
    const id = randomUUID();
    await expect(
      db.$transaction(async (tx) => {
        const note = await tx.notification.create({
          data: {
            id,
            userId: employee.id,
            type: "TEST",
            title: "rollback",
            message: "test",
            entityType: "Task",
            entityId: task.id,
          },
        });
        await enqueueNotification(tx, note, {
          EMAIL_ENABLED: true,
          ONESIGNAL_ENABLED: true,
        });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(
      await db.outboxEvent.count({ where: { key: { endsWith: id } } }),
    ).toBe(0);
  });
  test("comment retry IDs prevent duplicates and reject changed payloads", async () => {
    const clientRequestId = randomUUID();
    const payload = {
      taskId: task.id,
      comment: "Retry-safe comment",
      clientRequestId,
    };
    const first = await emit(employeeSocket, "comment:create", payload);
    const second = await emit(employeeSocket, "comment:create", payload);
    expect(first.ok).toBe(true);
    expect(second.data.id).toBe(first.data.id);
    expect(
      await db.taskComment.count({
        where: { authorId: employee.id, clientRequestId },
      }),
    ).toBe(1);
    expect(
      await db.outboxEvent.count({
        where: { key: `comment-${first.data.id}` },
      }),
    ).toBe(1);
    expect(
      await emit(employeeSocket, "comment:create", {
        ...payload,
        comment: "Changed",
      }),
    ).toMatchObject({ ok: false, error: { code: "COMMENT_REQUEST_CONFLICT" } });
  });
  test("fanout rechecks task scope after a manager loses team ownership", async () => {
    await emit(managerSocket, "task:subscribe", { taskId: task.id });
    const seen = [],
      listener = (event) => seen.push(event);
    managerSocket.on("comment:created", listener);
    await db.team.update({
      where: { id: team.id },
      data: { managerId: otherManager.id },
    });
    try {
      await createOutboxDelivery(
        db,
        redis,
      )({
        id: randomUUID(),
        kind: "COMMENT_LIVE",
        payload: { taskId: task.id, commentId: randomUUID() },
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(seen).toEqual([]);
    } finally {
      managerSocket.off("comment:created", listener);
      await db.team.update({
        where: { id: team.id },
        data: { managerId: manager.id },
      });
    }
  });
  test("enabled providers enqueue independent email, push and live work atomically", async () => {
    await db.user.update({
      where: { id: employee.id },
      data: { pushEnabled: true },
    });
    const note = await db.notification.findFirst({
      where: { userId: employee.id },
    });
    await db.$transaction((tx) =>
      enqueueNotification(tx, note, {
        EMAIL_ENABLED: true,
        ONESIGNAL_ENABLED: true,
      }),
    );
    expect(
      (await db.outboxEvent.findMany({ where: { key: { endsWith: note.id } } }))
        .map((row) => row.kind)
        .sort(),
    ).toEqual(["EMAIL", "NOTIFICATION_LIVE", "PUSH"]);
    const sent = [];
    const deliver = createOutboxDelivery(db, redis, {
      email: async () => {
        sent.push("email");
        return "accepted";
      },
      push: async () => {
        sent.push("push");
        return "accepted";
      },
    });
    for (const event of await db.outboxEvent.findMany({
      where: { key: { endsWith: note.id }, kind: { in: ["EMAIL", "PUSH"] } },
    }))
      await deliver(event);
    expect(sent.sort()).toEqual(["email", "push"]);
  });
  test("revoked sessions cannot post comments over an existing socket", async () => {
    const session = await login(employee.email);
    const socket = await connect(session.token);
    try {
      await request(app)
        .post("/api/v1/auth/logout")
        .set("X-CSRF-Protection", "1")
        .set("Cookie", session.cookie)
        .send({});
      expect(
        await emit(socket, "comment:create", {
          taskId: task.id,
          comment: "Denied after logout",
        }),
      ).toMatchObject({ ok: false, error: { code: "SESSION_REVOKED" } });
    } finally {
      socket.disconnect();
    }
  });
  test("the worker runtime scheduler drains committed live events", async () => {
    const saved = await request(app)
      .post(`/api/v1/tasks/${task.id}/comments`)
      .set(auth(m.token))
      .send({ comment: "Scheduled broadcast" });
    expect(saved.status).toBe(201);
    // Same runtime as the worker entrypoint; one shared Prisma client for PGlite.
    const runtime = await startWorkers({ db, connection: redis });
    try {
      const deadline = Date.now() + 10000;
      let event;
      do {
        event = await db.outboxEvent.findUnique({
          where: { key: `comment-${saved.body.data.id}` },
        });
        if (event?.processedAt) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      } while (Date.now() < deadline);
      expect(event.result).toBe("published");
    } finally {
      await runtime.close();
    }
  });
});

describe("OneSignal task delivery", () => {
  test("manager assignment commits in-app and targeted push, and retries reuse the durable event ID", async () => {
    const previous = env.ONESIGNAL_ENABLED;
    const config = {
      ONESIGNAL_ENABLED: true,
      ONESIGNAL_APP_ID: randomUUID(),
      ONESIGNAL_REST_API_KEY: "mock-test-only",
      ONESIGNAL_ID_SECRET: "mock-alias-secret-more-than-thirty-two-characters",
      FRONTEND_URL: "https://workforce-frontend.vercel.app",
    };
    await db.user.update({
      where: { id: employee.id },
      data: { pushEnabled: true },
    });
    let assigned;
    try {
      env.ONESIGNAL_ENABLED = true;
      assigned = await createTask("Private assigned task");
    } finally {
      env.ONESIGNAL_ENABLED = previous;
    }
    const notice = await db.notification.findFirst({
      where: { entityId: assigned.id, type: "TASK_ASSIGNED" },
    });
    expect(notice.userId).toBe(employee.id);
    expect(
      await db.notification.count({ where: { entityId: assigned.id } }),
    ).toBe(1);
    const event = await db.outboxEvent.findUnique({
      where: { key: `push-${notice.id}` },
    });
    expect(event).not.toBeNull();
    const live = await db.outboxEvent.findUnique({
      where: { key: `live-${notice.id}` },
    });
    const publish = jest.fn(async () => 1);
    const sent = [];
    let failed = false;
    const provider = async (_url, options) => {
      const body = JSON.parse(options.body);
      sent.push(body);
      if (body.idempotency_key === event.id && !failed) {
        failed = true;
        return { ok: false, status: 503, headers: { get: () => null } };
      }
      return { ok: true, json: async () => ({ id: randomUUID() }) };
    };
    const deliver = createOutboxDelivery(
      db,
      { publish },
      { push: createPushSender(config, provider) },
    );
    expect(await deliver(live)).toBe("published");
    expect(JSON.parse(publish.mock.calls[0][1]).userId).toBe(employee.id);
    await processOutbox(db, deliver, { kinds: ["PUSH"], limit: 1000 });
    const retry = await db.outboxEvent.findUnique({ where: { id: event.id } });
    expect(retry).toMatchObject({
      processedAt: null,
      failedAt: null,
      attempts: 1,
      lastError: "ONESIGNAL_HTTP_503",
    });
    expect(
      await db.notification.findUnique({ where: { id: notice.id } }),
    ).not.toBeNull();
    await processOutbox(db, deliver, {
      kinds: ["PUSH"],
      limit: 1000,
      now: new Date(Date.now() + 2000000),
    });
    const accepted = await db.outboxEvent.findUnique({
      where: { id: event.id },
    });
    expect(accepted).toMatchObject({
      result: "accepted",
      attempts: 2,
      failedAt: null,
    });
    const attempts = sent.filter((body) => body.idempotency_key === event.id);
    expect(attempts).toHaveLength(2);
    for (const body of attempts) {
      expect(body.include_aliases).toEqual({
        external_id: [pushExternalId(employee.id, config)],
      });
      expect(body.target_channel).toBe("push");
      expect(body.url).toBe(
        "https://workforce-frontend.vercel.app/notifications",
      );
      expect(body.included_segments).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain(assigned.title);
    }
  });
  test("preferences affect only the authenticated account and are checked at delivery", async () => {
    expect(
      (
        await request(app)
          .patch("/api/v1/notifications/push-preference")
          .send({ enabled: true })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .patch("/api/v1/notifications/push-preference")
          .set(auth(e.token))
          .send({ enabled: "true" })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .patch("/api/v1/notifications/push-preference")
          .set(auth(e.token))
          .send({ enabled: false })
      ).status,
    ).toBe(200);
    expect(
      (await db.user.findUnique({ where: { id: employee.id } })).pushEnabled,
    ).toBe(false);
    const note = await db.notification.findFirst({
      where: { userId: employee.id },
    });
    const push = jest.fn();
    const deliver = createOutboxDelivery(db, redis, { push });
    expect(
      await deliver({
        id: randomUUID(),
        kind: "PUSH",
        payload: { notificationId: note.id },
      }),
    ).toBe("preference-disabled");
    expect(push).not.toHaveBeenCalled();
  });
  test("self assignment excludes the actor; employee status notifies the task manager", async () => {
    const self = await request(app)
      .post("/api/v1/tasks")
      .set(auth(m.token))
      .send({
        title: "Manager own task",
        projectId: project.id,
        assigneeId: manager.id,
        priority: "HIGH",
        dueDate: "2026-01-01",
        estimatedHours: 1,
      });
    expect(self.status).toBe(201);
    expect(
      await db.notification.count({ where: { entityId: self.body.data.id } }),
    ).toBe(0);
    const assigned = await createTask("Status recipient test");
    const changed = await request(app)
      .patch(`/api/v1/tasks/${assigned.id}/status`)
      .set(auth(e.token))
      .send({ status: "IN_PROGRESS", version: 1 });
    expect(changed.status).toBe(200);
    const notices = await db.notification.findMany({
      where: { entityId: assigned.id, type: "TASK_STATUS_CHANGED" },
    });
    expect(notices.map((row) => row.userId)).toEqual([manager.id]);
  });
});
