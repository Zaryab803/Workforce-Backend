import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { ensureDbServer, stopDbServer } from "../src/config/db-server.js";

const db = new PrismaClient();

const seedData = {
  roles: [
    { id: "10000000-0000-0000-0000-000000000001", name: "ADMIN" },
    { id: "10000000-0000-0000-0000-000000000002", name: "MANAGER" },
    { id: "10000000-0000-0000-0000-000000000003", name: "EMPLOYEE" },
  ],
  employees: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      employeeCode: "ORB-ADM01",
      name: "Zaryab", // Changed from Alex Morgan
      email: "admin@workforce.com",
      phone: "+1 (415) 555-1000",
      role: "ADMIN",
      roleId: "10000000-0000-0000-0000-000000000001",
      managerId: null,
      joined: "2025-01-12",
      active: true,
      employmentStatus: "ACTIVE",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&fit=crop&crop=face",
      password: "admin123", // Admin password
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      employeeCode: "ORB-MGR01",
      name: "Sarah Chen",
      email: "manager@orbit.demo",
      phone: "+1 (415) 555-1001",
      role: "MANAGER",
      roleId: "10000000-0000-0000-0000-000000000002",
      managerId: "11111111-1111-4111-8111-111111111111",
      joined: "2025-02-12",
      active: true,
      employmentStatus: "ACTIVE",
      avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&fit=crop&crop=face",
      password: "OrbitDemo2026!",
    },
    {
      id: "44444444-4444-4444-8444-444444444444",
      employeeCode: "ORB-MGR02",
      name: "James Wilson",
      email: "james.wilson@orbit.demo",
      phone: "+1 (415) 555-1002",
      role: "MANAGER",
      roleId: "10000000-0000-0000-0000-000000000002",
      managerId: "11111111-1111-4111-8111-111111111111",
      joined: "2025-03-12",
      active: true,
      employmentStatus: "ACTIVE",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&fit=crop&crop=face",
      password: "OrbitDemo2026!",
    },
    {
      id: "66666666-6666-4666-8666-666666666666",
      employeeCode: "ORB-MGR03",
      name: "Olivia Bennett",
      email: "olivia.bennett@orbit.demo",
      phone: "+1 (415) 555-1003",
      role: "MANAGER",
      roleId: "10000000-0000-0000-0000-000000000002",
      managerId: "11111111-1111-4111-8111-111111111111",
      joined: "2025-04-12",
      active: true,
      employmentStatus: "ACTIVE",
      avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&fit=crop&crop=face",
      password: "OrbitDemo2026!",
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      employeeCode: "ORB-EMP01",
      name: "Noah Williams",
      email: "employee@orbit.demo",
      phone: "+1 (415) 555-1004",
      role: "EMPLOYEE",
      roleId: "10000000-0000-0000-0000-000000000003",
      managerId: "22222222-2222-4222-8222-222222222222",
      joined: "2025-05-12",
      active: true,
      employmentStatus: "ACTIVE",
      avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&fit=crop&crop=face",
      password: "OrbitDemo2026!",
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      employeeCode: "ORB-EMP02",
      name: "Emma Davis",
      email: "other.employee@orbit.demo",
      phone: "+1 (415) 555-1005",
      role: "EMPLOYEE",
      roleId: "10000000-0000-0000-0000-000000000003",
      managerId: "44444444-4444-4444-8444-444444444444",
      joined: "2025-06-12",
      active: true,
      employmentStatus: "ACTIVE",
      avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&fit=crop&crop=face",
      password: "OrbitDemo2026!",
    },
    {
      id: "77777777-7777-4777-8777-777777777777",
      employeeCode: "ORB-EMP03",
      name: "Liam Anderson",
      email: "liam.anderson@orbit.demo",
      phone: "+1 (415) 555-1006",
      role: "EMPLOYEE",
      roleId: "10000000-0000-0000-0000-000000000003",
      managerId: "44444444-4444-4444-8444-444444444444",
      joined: "2025-07-12",
      active: true,
      employmentStatus: "ACTIVE",
      avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200&fit=crop&crop=face",
      password: "OrbitDemo2026!",
    },
    {
      id: "88888888-8888-4888-8888-888888888888",
      employeeCode: "ORB-EMP04",
      name: "Ava Thompson",
      email: "ava.thompson@orbit.demo",
      phone: "+1 (415) 555-1007",
      role: "EMPLOYEE",
      roleId: "10000000-0000-0000-0000-000000000003",
      managerId: "66666666-6666-4666-8666-666666666666",
      joined: "2025-08-12",
      active: true,
      employmentStatus: "ACTIVE",
      avatar: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&fit=crop&crop=face",
      password: "OrbitDemo2026!",
    },
  ],
  teams: [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Product & Design",
      description: "Shaping thoughtful experiences, design systems, and product ergonomics.",
      managerId: "22222222-2222-4222-8222-222222222222",
    },
    {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "Engineering",
      description: "Building high-performance cloud architecture, APIs, and web interfaces.",
      managerId: "44444444-4444-4444-8444-444444444444",
    },
    {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      name: "Growth & Marketing",
      description: "Connecting great software with customers and driving adoption metrics.",
      managerId: "66666666-6666-4666-8666-666666666666",
    },
  ],
  teamMembers: [
    {
      id: "90000001-0000-0000-0000-000000000001",
      teamId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      userId: "22222222-2222-4222-8222-222222222222",
    },
    {
      id: "90000001-0000-0000-0000-000000000002",
      teamId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      userId: "33333333-3333-4333-8333-333333333333",
    },
    {
      id: "90000001-0000-0000-0000-000000000003",
      teamId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      userId: "44444444-4444-4444-8444-444444444444",
    },
    {
      id: "90000001-0000-0000-0000-000000000004",
      teamId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      userId: "55555555-5555-4555-8555-555555555555",
    },
    {
      id: "90000001-0000-0000-0000-000000000005",
      teamId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      userId: "77777777-7777-4777-8777-777777777777",
    },
    {
      id: "90000001-0000-0000-0000-000000000006",
      teamId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      userId: "66666666-6666-4666-8666-666666666666",
    },
    {
      id: "90000001-0000-0000-0000-000000000007",
      teamId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      userId: "88888888-8888-4888-8888-888888888888",
    },
  ],
  projects: [
    {
      id: "d0000000-0000-0000-0000-000000000001",
      name: "Orbit Workspace",
      description: "Core workforce orchestration portal and real-time activity hub.",
      status: "ACTIVE",
      teamId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      createdBy: "22222222-2222-4222-8222-222222222222",
    },
    {
      id: "d0000000-0000-0000-0000-000000000002",
      name: "Customer Portal",
      description: "Self-service dashboard and project delivery tracking for clients.",
      status: "ACTIVE",
      teamId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      createdBy: "44444444-4444-4444-8444-444444444444",
    },
    {
      id: "d0000000-0000-0000-0000-000000000003",
      name: "Brand Refresh 2026",
      description: "Global design system evolution, typography updates, and visual identity.",
      status: "ACTIVE",
      teamId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      createdBy: "66666666-6666-4666-8666-666666666666",
    },
  ],
  tasks: [
    {
      id: "e0000000-0000-0000-0000-000000000001",
      title: "Redesign the onboarding experience",
      description: "Create a modern, friction-free onboarding wizard with step validation, role assignment, and guided tours.",
      projectId: "d0000000-0000-0000-0000-000000000001",
      teamId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      assigneeId: "33333333-3333-4333-8333-333333333333",
      creatorId: "22222222-2222-4222-8222-222222222222",
      priority: "HIGH",
      status: "IN_PROGRESS",
      dueDate: new Date("2026-10-15"),
      estimatedHours: 18,
      actualHours: 9.5,
      createdAt: new Date("2026-09-20T08:30:00.000Z"),
      updatedAt: new Date("2026-09-24T14:20:00.000Z"),
    },
    {
      id: "e0000000-0000-0000-0000-000000000002",
      title: "Build interactive analytics charts",
      description: "Implement Recharts or Tremor visualizations for workforce workload, weekly task velocity, and team capacity.",
      projectId: "d0000000-0000-0000-0000-000000000001",
      teamId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      assigneeId: "55555555-5555-4555-8555-555555555555",
      creatorId: "44444444-4444-4444-8444-444444444444",
      priority: "URGENT",
      status: "TODO",
      dueDate: new Date("2026-10-08"),
      estimatedHours: 14,
      actualHours: 2,
      createdAt: new Date("2026-09-21T09:00:00.000Z"),
      updatedAt: new Date("2026-09-22T11:00:00.000Z"),
    },
    {
      id: "e0000000-0000-0000-0000-000000000003",
      title: "Optimize PostgreSQL query latency on Supabase",
      description: "Add composite indexes on tasks(team_id, status) and users(email, is_active) to keep dashboard queries under 30ms.",
      projectId: "d0000000-0000-0000-0000-000000000002",
      teamId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      assigneeId: "77777777-7777-4777-8777-777777777777",
      creatorId: "44444444-4444-4444-8444-444444444444",
      priority: "HIGH",
      status: "IN_REVIEW",
      dueDate: new Date("2026-10-05"),
      estimatedHours: 8,
      actualHours: 7.5,
      createdAt: new Date("2026-09-18T10:15:00.000Z"),
      updatedAt: new Date("2026-09-25T11:45:00.000Z"),
    },
    {
      id: "e0000000-0000-0000-0000-000000000004",
      title: "Ship design system tokens and dark mode contrast",
      description: "Align Tailwind CSS colors, border radius, elevation tokens, and WCAG AA contrast compliance across dark mode.",
      projectId: "d0000000-0000-0000-0000-000000000003",
      teamId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      assigneeId: "33333333-3333-4333-8333-333333333333",
      creatorId: "22222222-2222-4222-8222-222222222222",
      priority: "MEDIUM",
      status: "COMPLETED",
      dueDate: new Date("2026-09-22"),
      estimatedHours: 12,
      actualHours: 11,
      createdAt: new Date("2026-09-12T08:00:00.000Z"),
      updatedAt: new Date("2026-09-22T17:00:00.000Z"),
    },
    {
      id: "e0000000-0000-0000-0000-000000000005",
      title: "Prepare Q4 product changelog & launch announcement",
      description: "Draft customer-facing release notes detailing team collaboration tools, kanban filters, and Supabase integration.",
      projectId: "d0000000-0000-0000-0000-000000000003",
      teamId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      assigneeId: "88888888-8888-4888-8888-888888888888",
      creatorId: "66666666-6666-4666-8666-666666666666",
      priority: "LOW",
      status: "BLOCKED",
      dueDate: new Date("2026-10-25"),
      estimatedHours: 6,
      actualHours: 1.5,
      createdAt: new Date("2026-09-22T13:00:00.000Z"),
      updatedAt: new Date("2026-09-24T16:10:00.000Z"),
    },
  ],
  comments: [
    {
      id: "f0000000-0000-0000-0000-000000000001",
      taskId: "e0000000-0000-0000-0000-000000000001",
      authorId: "22222222-2222-4222-8222-222222222222",
      body: "Initial wireframes look great! Please ensure mobile responsive viewports are verified before closing.",
      createdAt: new Date("2026-09-21T11:00:00.000Z"),
    },
    {
      id: "f0000000-0000-0000-0000-000000000002",
      taskId: "e0000000-0000-0000-0000-000000000001",
      authorId: "33333333-3333-4333-8333-333333333333",
      body: "Updated with 375px and 768px tablet layout variants. Ready for design team review.",
      createdAt: new Date("2026-09-24T14:15:00.000Z"),
    },
    {
      id: "f0000000-0000-0000-0000-000000000003",
      taskId: "e0000000-0000-0000-0000-000000000003",
      authorId: "44444444-4444-4444-8444-444444444444",
      body: "Query plans look healthy in Supabase explain analyze. Down to 14ms from 180ms.",
      createdAt: new Date("2026-09-25T11:40:00.000Z"),
    },
  ],
  workActivities: [
    {
      id: "a1000000-0000-0000-0000-000000000001",
      taskId: "e0000000-0000-0000-0000-000000000001",
      userId: "33333333-3333-4333-8333-333333333333",
      hours: 5.5,
      description: "Constructed reusable multi-step stepper component with keyboard navigation.",
      activityDate: new Date("2026-09-22"),
    },
    {
      id: "a1000000-0000-0000-0000-000000000002",
      taskId: "e0000000-0000-0000-0000-000000000001",
      userId: "33333333-3333-4333-8333-333333333333",
      hours: 4.0,
      description: "Implemented validation schemas with Zod and connected error feedback banners.",
      activityDate: new Date("2026-09-24"),
    },
    {
      id: "a1000000-0000-0000-0000-000000000003",
      taskId: "e0000000-0000-0000-0000-000000000003",
      userId: "77777777-7777-4777-8777-777777777777",
      hours: 7.5,
      description: "Created database migration adding btree indexes on foreign keys and compound status filters.",
      activityDate: new Date("2026-09-25"),
    },
  ],
  notifications: [
    {
      id: "b1000000-0000-0000-0000-000000000001",
      userId: "33333333-3333-4333-8333-333333333333",
      type: "TASK_ASSIGNED",
      title: "New Task Assigned",
      message: "Sarah Chen assigned you to “Redesign the onboarding experience”.",
      entityType: "Task",
      entityId: "e0000000-0000-0000-0000-000000000001",
      isRead: false,
      createdAt: new Date("2026-09-20T08:30:00.000Z"),
    },
    {
      id: "b1000000-0000-0000-0000-000000000002",
      userId: "44444444-4444-4444-8444-444444444444",
      type: "TASK_STATUS_CHANGED",
      title: "Task Ready for Review",
      message: "Liam Anderson moved “Optimize PostgreSQL query latency on Supabase” to In Review.",
      entityType: "Task",
      entityId: "e0000000-0000-0000-0000-000000000003",
      isRead: true,
      createdAt: new Date("2026-09-25T11:45:00.000Z"),
    },
  ],
};

async function main() {
  await ensureDbServer();
  console.log("🌱 Starting database seeding...");

  // Generate bcrypt hashes (support both admin123 and Demo123!)
  const adminPasswordHash = await bcrypt.hash("admin123", 10);
  const demoPasswordHash = await bcrypt.hash("Demo123!", 10);

  await db.$transaction(async (tx) => {
    // 1. Roles
    for (const r of seedData.roles) {
      await tx.role.upsert({
        where: { name: r.name },
        update: {},
        create: { id: r.id, name: r.name },
      });
    }
    console.log("✓ Roles seeded");

    // 2. Employees / Users
    for (const emp of seedData.employees) {
      const passwordHash =
        emp.role === "ADMIN" ? adminPasswordHash : demoPasswordHash;

      await tx.user.upsert({
        where: { email: emp.email },
        update: {
          name: emp.name,
          employeeCode: emp.employeeCode,
          phone: emp.phone,
          passwordHash,
          avatarUrl: emp.avatar,
          employmentStatus: emp.employmentStatus,
          isActive: emp.active,
        },
        create: {
          id: emp.id,
          employeeCode: emp.employeeCode,
          name: emp.name,
          email: emp.email,
          passwordHash,
          phone: emp.phone,
          roleId: emp.roleId,
          managerId: emp.managerId,
          joiningDate: new Date(emp.joined),
          employmentStatus: emp.employmentStatus,
          avatarUrl: emp.avatar,
          isActive: emp.active,
        },
      });
    }
    console.log("✓ Employees seeded (Admin name: Zaryab, password: admin123)");

    // 3. Teams
    for (const team of seedData.teams) {
      await tx.team.upsert({
        where: { id: team.id },
        update: {
          name: team.name,
          description: team.description,
          managerId: team.managerId,
        },
        create: {
          id: team.id,
          name: team.name,
          description: team.description,
          managerId: team.managerId,
        },
      });
    }
    console.log("✓ Teams seeded");

    // 4. Team Members
    for (const tm of seedData.teamMembers) {
      await tx.teamMember.upsert({
        where: { teamId_userId: { teamId: tm.teamId, userId: tm.userId } },
        update: {},
        create: {
          id: tm.id,
          teamId: tm.teamId,
          userId: tm.userId,
        },
      });
    }
    console.log("✓ Team Members seeded");

    // 5. Projects
    for (const p of seedData.projects) {
      await tx.project.upsert({
        where: { id: p.id },
        update: {
          name: p.name,
          description: p.description,
          status: p.status,
          teamId: p.teamId,
          createdBy: p.createdBy,
        },
        create: {
          id: p.id,
          name: p.name,
          description: p.description,
          status: p.status,
          teamId: p.teamId,
          createdBy: p.createdBy,
        },
      });
    }
    console.log("✓ Projects seeded");

    // 6. Tasks
    for (const t of seedData.tasks) {
      await tx.task.upsert({
        where: { id: t.id },
        update: {
          title: t.title,
          description: t.description,
          priority: t.priority,
          status: t.status,
          dueDate: t.dueDate,
          estimatedHours: t.estimatedHours,
          actualHours: t.actualHours,
        },
        create: {
          id: t.id,
          title: t.title,
          description: t.description,
          projectId: t.projectId,
          teamId: t.teamId,
          assigneeId: t.assigneeId,
          createdBy: t.creatorId,
          priority: t.priority,
          status: t.status,
          dueDate: t.dueDate,
          estimatedHours: t.estimatedHours,
          actualHours: t.actualHours,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        },
      });
    }
    console.log("✓ Tasks seeded");

    // 7. Comments
    for (const c of seedData.comments) {
      await tx.taskComment.upsert({
        where: { id: c.id },
        update: { comment: c.body },
        create: {
          id: c.id,
          taskId: c.taskId,
          authorId: c.authorId,
          comment: c.body,
          createdAt: c.createdAt,
        },
      });
    }
    console.log("✓ Comments seeded");

    // 8. Work Activities
    for (const w of seedData.workActivities) {
      await tx.workActivity.upsert({
        where: { id: w.id },
        update: {
          hours: w.hours,
          description: w.description,
          activityDate: w.activityDate,
        },
        create: {
          id: w.id,
          taskId: w.taskId,
          userId: w.userId,
          hours: w.hours,
          description: w.description,
          activityDate: w.activityDate,
        },
      });
    }
    console.log("✓ Work Activities seeded");

    // 9. Notifications
    for (const n of seedData.notifications) {
      await tx.notification.upsert({
        where: { id: n.id },
        update: {
          title: n.title,
          message: n.message,
          isRead: n.isRead,
        },
        create: {
          id: n.id,
          userId: n.userId,
          type: n.type,
          title: n.title,
          message: n.message,
          entityType: n.entityType,
          entityId: n.entityId,
          isRead: n.isRead,
          createdAt: n.createdAt,
        },
      });
    }
    console.log("✓ Notifications seeded");
  });

  console.log("\n==================================================");
  console.log("🎉 Database seeded successfully with custom data!");
  console.log("👤 Admin:    admin@orbit.demo | Zaryab");
  console.log("🔑 Password: admin123");
  console.log("👥 Other accounts: OrbitDemo2026!");
  console.log("==================================================\n");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
