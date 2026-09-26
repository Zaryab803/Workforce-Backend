import "dotenv/config";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { io as socketClient } from "socket.io-client";
import Redis from "ioredis";
import { ensureDbServer, stopDbServer } from "../src/config/db-server.js";
import { ensureRedisServer, stopRedisServer } from "../src/config/redis-server.js";
import { prisma } from "../src/config/prisma.js";
import { createApp } from "../src/app.js";
import { attachRealtime } from "../src/realtime/server.js";
import { startWorkers } from "../src/workers/start-workers.js";
import { signAccessToken } from "../src/modules/auth/auth.token.js";
import { env } from "../src/config/env.js";

async function run() {
  console.log("=== STARTING REAL-TIME & REDIS WORKER VERIFICATION ===");

  // 1. Ensure local services
  await ensureDbServer();
  await ensureRedisServer();

  // 2. Verify Redis PING -> PONG
  const testRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });
  const pingResult = await testRedis.ping();
  console.log(`[CHECK 1] Redis PING result: ${pingResult}`);
  if (pingResult !== "PONG") {
    throw new Error(`Expected PONG, got ${pingResult}`);
  }

  // 3. Connect Prisma & verify DB
  await prisma.$connect();
  console.log("[CHECK 2] PostgreSQL connected successfully");

  let adminRole = await prisma.role.findUnique({ where: { name: "ADMIN" } });
  if (!adminRole) {
    console.log("Database needs seed. Seeding basic roles and demo users...");
    adminRole = await prisma.role.create({ data: { name: "ADMIN" } });
    await prisma.role.create({ data: { name: "MANAGER" } });
    await prisma.role.create({ data: { name: "EMPLOYEE" } });
  }

  const managerRole = await prisma.role.findUnique({ where: { name: "MANAGER" } });
  const employeeRole = await prisma.role.findUnique({ where: { name: "EMPLOYEE" } });

  // Get or create manager
  let manager = await prisma.user.findFirst({
    where: { role: { name: "MANAGER" } },
    include: { role: true },
  });
  if (!manager) {
    manager = await prisma.user.create({
      data: {
        email: `manager-${Date.now()}@example.com`,
        passwordHash: "$2b$10$abcdefghijklmnopqrstuvwxyzaaaaaaaaaaaaaaaaaaaaaaaaa",
        name: "Test Manager",
        roleId: managerRole.id,
        employmentStatus: "ACTIVE",
      },
      include: { role: true },
    });
  }

  // Get or create employee
  let employee = await prisma.user.findFirst({
    where: { role: { name: "EMPLOYEE" } },
    include: { role: true },
  });
  if (!employee) {
    employee = await prisma.user.create({
      data: {
        email: `employee-${Date.now()}@example.com`,
        passwordHash: "$2b$10$abcdefghijklmnopqrstuvwxyzaaaaaaaaaaaaaaaaaaaaaaaaa",
        name: "Test Employee",
        roleId: employeeRole.id,
        employmentStatus: "ACTIVE",
      },
      include: { role: true },
    });
  }

  // Get or create team
  let team = await prisma.team.findFirst({ where: { managerId: manager.id } });
  if (!team) {
    team = await prisma.team.create({
      data: {
        name: "Test Engineering Team",
        managerId: manager.id,
      },
    });
  }

  // Ensure employee is in the team
  const existingMember = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: team.id, userId: employee.id } },
  });
  if (!existingMember) {
    await prisma.teamMember.create({
      data: { teamId: team.id, userId: employee.id },
    });
  }

  // Get or create task assigned to employee
  let task = await prisma.task.findFirst({
    where: { assigneeId: employee.id, teamId: team.id },
  });
  if (!task) {
    task = await prisma.task.create({
      data: {
        title: "Verify Redis Realtime and Workers",
        description: "Task for end-to-end socket and queue verification",
        assigneeId: employee.id,
        teamId: team.id,
        status: "IN_PROGRESS",
        dueDate: new Date(Date.now() + 86400000),
        estimatedHours: 4,
        createdById: manager.id,
      },
    });
  }
  console.log(`[CHECK 3] Test Task ready (ID: ${task.id})`);

  // 4. Start API server & Realtime with Redis
  const apiRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });
  const app = createApp({ db: prisma, redis: apiRedis });
  const httpServer = createServer(app);
  const realtime = await attachRealtime(httpServer, { db: prisma, redis: apiRedis });

  const testPort = 4055;
  await new Promise((res) => httpServer.listen(testPort, res));
  console.log(`[CHECK 4] API & Realtime server listening on port ${testPort}`);

  // 5. Start Workers with Redis connection
  const workerRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const workerRuntime = await startWorkers({ db: prisma, connection: workerRedis });
  console.log("[CHECK 5] BullMQ background workers initialized and ready");

  // 6. Connect two authorized socket clients
  const managerSession = await prisma.refreshSession.create({
    data: {
      userId: manager.id,
      familyId: randomUUID(),
      tokenHash: "mgr-test-" + randomUUID(),
      expiresAt: new Date(Date.now() + 86400000),
      ipAddress: "127.0.0.1",
      userAgent: "socket-test",
      persistent: true,
    },
  });

  const employeeSession = await prisma.refreshSession.create({
    data: {
      userId: employee.id,
      familyId: randomUUID(),
      tokenHash: "emp-test-" + randomUUID(),
      expiresAt: new Date(Date.now() + 86400000),
      ipAddress: "127.0.0.1",
      userAgent: "socket-test",
      persistent: true,
    },
  });

  const managerToken = signAccessToken(manager, managerSession.id);
  const employeeToken = signAccessToken(employee, employeeSession.id);

  const socketOptions = (token) => ({
    auth: { token },
    transports: ["websocket"],
    reconnection: false,
  });

  const managerSocket = socketClient(`http://localhost:${testPort}`, socketOptions(managerToken));
  const employeeSocket = socketClient(`http://localhost:${testPort}`, socketOptions(employeeToken));

  await Promise.all([
    new Promise((resolve, reject) => {
      managerSocket.on("connect", resolve);
      managerSocket.on("connect_error", reject);
    }),
    new Promise((resolve, reject) => {
      employeeSocket.on("connect", resolve);
      employeeSocket.on("connect_error", reject);
    }),
  ]);
  console.log("[CHECK 6] Both Manager and Employee sockets connected and authenticated");

  // 7. Subscribe manager socket to task
  await new Promise((resolve) => {
    managerSocket.emit("task:subscribe", { taskId: task.id }, resolve);
  });
  console.log(`[CHECK 7] Manager subscribed to task ${task.id}`);

  // 8. Record initial unread notification count for Manager
  const initialUnreadCount = await prisma.notification.count({
    where: { userId: manager.id, isRead: false },
  });

  // Setup promise to capture real-time comment and notification events at Manager browser
  const commentPromise = new Promise((resolve) => {
    managerSocket.once("comment:created", (data) => {
      console.log(`[REALTIME EVENT] Manager received comment:created event:`, data.commentId);
      resolve(data);
    });
  });

  const notificationPromise = new Promise((resolve) => {
    managerSocket.once("notification:created", (data) => {
      console.log(`[REALTIME EVENT] Manager received notification:created event:`, data.notificationId);
      resolve(data);
    });
  });

  // 9. Employee creates a comment on the task via socket
  const clientReqId = randomUUID();
  const commentText = `Live update verification comment ${Date.now()}`;
  console.log("Employee sending comment:create...");
  const commentResponse = await new Promise((resolve) => {
    employeeSocket.emit(
      "comment:create",
      {
        taskId: task.id,
        comment: commentText,
        clientRequestId: clientReqId,
      },
      resolve,
    );
  });

  console.log("[CHECK 8] Comment creation acknowledged:", commentResponse.ok ? "SUCCESS" : commentResponse.error);
  if (!commentResponse.ok) {
    throw new Error(`Failed to create comment: ${JSON.stringify(commentResponse.error)}`);
  }

  // 10. Verify comment:created received in Manager browser
  const receivedCommentEvent = await Promise.race([
    commentPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout waiting for comment:created event")), 5000)),
  ]);
  console.log("[CHECK 9] Real-time comment event successfully delivered to Manager browser!");

  // 11. Wait for In-App Notification & Outbox Worker Processing
  console.log("Waiting for BullMQ worker to process and deliver Outbox jobs...");
  let deliveredJob = null;
  for (let i = 0; i < 20; i++) {
    deliveredJob = await prisma.outboxEvent.findFirst({
      where: {
        key: `comment-${commentResponse.data.id}`,
        processedAt: { not: null },
      },
    });
    if (deliveredJob) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!deliveredJob) {
    throw new Error("Outbox event was not processed by the BullMQ worker");
  }
  console.log(`[CHECK 10] BullMQ worker processed outbox job: processedAt=${deliveredJob.processedAt}, result=${deliveredJob.result}`);

  // 12. Verify In-App Notification and Unread Count
  const newUnreadCount = await prisma.notification.count({
    where: { userId: manager.id, isRead: false },
  });
  console.log(`[CHECK 11] Unread notification count for Manager: initial=${initialUnreadCount}, new=${newUnreadCount}`);
  if (newUnreadCount <= initialUnreadCount) {
    throw new Error("Manager unread count did not increase after comment notification");
  }

  // Cleanup
  managerSocket.disconnect();
  employeeSocket.disconnect();
  await workerRuntime.close();
  await realtime.close();
  await new Promise((res) => httpServer.close(res));
  await testRedis.quit();
  await apiRedis.quit();
  await workerRedis.quit();
  await prisma.$disconnect();

  console.log("\n========================================================");
  console.log("ALL 11 VERIFICATION CHECKS PASSED SUCCESSFULLY!");
  console.log("========================================================");
  process.exit(0);
}

run().catch(async (err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
