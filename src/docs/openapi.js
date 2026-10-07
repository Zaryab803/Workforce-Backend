// OpenAPI 3.0 source shared by Swagger UI, JSON export, and validation tests.
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const string = { type: "string" },
  uuid = { type: "string", format: "uuid" },
  date = { type: "string", format: "date" },
  timestamp = { type: "string", format: "date-time" };
const object = (properties, required = []) => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});
const enumOf = (values) => ({ type: "string", enum: values });
const role = enumOf(["ADMIN", "MANAGER", "EMPLOYEE"]);
const status = enumOf([
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "IN_REVIEW",
  "COMPLETED",
  "CANCELLED",
]);
const priority = enumOf(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const schemas = {
  Error: object(
    {
      success: { type: "boolean", enum: [false] },
      error: object(
        {
          code: string,
          message: string,
          requestId: string,
          details: {
            type: "array",
            items: object({ field: string, message: string }),
          },
        },
        ["code", "message"],
      ),
    },
    ["success", "error"],
  ),
  Person: object(
    { id: uuid, name: string, avatarUrl: { ...string, nullable: true } },
    ["id", "name"],
  ),
  User: object(
    {
      id: uuid,
      employeeCode: string,
      name: string,
      email: { type: "string", format: "email" },
      phone: { ...string, nullable: true },
      role,
      managerId: { ...uuid, nullable: true },
      joiningDate: timestamp,
      employmentStatus: enumOf(["ACTIVE", "ON_LEAVE", "INACTIVE"]),
      avatarUrl: { ...string, nullable: true },
      isActive: { type: "boolean" },
      createdAt: timestamp,
      updatedAt: timestamp,
      teamIds: { type: "array", items: uuid },
    },
    ["id", "name", "email", "role", "isActive"],
  ),
  Login: object(
    {
      email: { type: "string", format: "email", example: "manager@orbit.demo" },
      password: {
        type: "string",
        format: "password",
        example: "ChangeThisDemo123!",
      },
      remember: { type: "boolean", default: true },
    },
    ["email", "password"],
  ),
  Tokens: object(
    {
      user: ref("User"),
      accessToken: string,
      tokenType: { type: "string", enum: ["Bearer"] },
    },
    ["user", "accessToken", "tokenType"],
  ),
  UserCreate: object(
    {
      employeeCode: { type: "string", minLength: 2, maxLength: 30 },
      name: { type: "string", minLength: 2, maxLength: 100 },
      email: { type: "string", format: "email" },
      password: {
        type: "string",
        minLength: 10,
        maxLength: 72,
        description:
          "Uppercase, lowercase, number, symbol; at most 72 UTF-8 bytes.",
      },
      phone: { ...string, nullable: true },
      role,
      managerId: { ...uuid, nullable: true },
      joiningDate: date,
      employmentStatus: enumOf(["ACTIVE", "ON_LEAVE", "INACTIVE"]),
      avatarUrl: { type: "string", format: "uri", nullable: true },
      isActive: { type: "boolean", default: true },
      teamIds: { type: "array", items: uuid, maxItems: 20 },
    },
    ["employeeCode", "name", "email", "password", "joiningDate"],
  ),
  Team: object(
    {
      id: uuid,
      name: string,
      description: string,
      managerId: uuid,
      manager: ref("Person"),
      createdAt: timestamp,
      updatedAt: timestamp,
      _count: object({
        members: { type: "integer" },
        tasks: { type: "integer" },
      }),
    },
    ["id", "name", "managerId"],
  ),
  TeamCreate: object(
    {
      name: { type: "string", minLength: 2, maxLength: 100 },
      description: { type: "string", maxLength: 1000 },
      managerId: uuid,
    },
    ["name", "managerId"],
  ),
  Project: object(
    {
      id: uuid,
      name: string,
      description: string,
      status: enumOf(["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"]),
      teamId: uuid,
      createdBy: uuid,
      createdAt: timestamp,
      updatedAt: timestamp,
      team: object({ id: uuid, name: string }),
      creator: ref("Person"),
    },
    ["id", "name", "status", "teamId"],
  ),
  ProjectCreate: object(
    {
      name: { type: "string", minLength: 2, maxLength: 120 },
      description: { type: "string", maxLength: 3000 },
      teamId: uuid,
      status: enumOf(["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"]),
    },
    ["name", "teamId"],
  ),
  Task: object(
    {
      id: uuid,
      title: string,
      description: string,
      teamId: uuid,
      projectId: uuid,
      assigneeId: uuid,
      createdBy: uuid,
      priority,
      status,
      dueDate: timestamp,
      estimatedHours: { type: "number" },
      actualHours: { type: "number" },
      version: { type: "integer", minimum: 1 },
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: { ...timestamp, nullable: true },
      assignee: ref("Person"),
      creator: ref("Person"),
      project: object({ id: uuid, name: string }),
      team: object({ id: uuid, name: string }),
    },
    ["id", "title", "version", "status", "assigneeId", "projectId"],
  ),
  TaskCreate: object(
    {
      title: { type: "string", minLength: 3, maxLength: 180 },
      description: { type: "string", maxLength: 10000 },
      projectId: uuid,
      assigneeId: uuid,
      priority,
      dueDate: date,
      estimatedHours: {
        type: "number",
        minimum: 0.01,
        maximum: 9999,
        multipleOf: 0.01,
      },
    },
    ["title", "projectId", "assigneeId", "dueDate", "estimatedHours"],
  ),
  StatusUpdate: object({ status, version: { type: "integer", minimum: 1 } }, [
    "status",
    "version",
  ]),
  Comment: object(
    {
      id: uuid,
      taskId: uuid,
      authorId: uuid,
      comment: string,
      clientRequestId: { ...uuid, nullable: true },
      createdAt: timestamp,
      updatedAt: timestamp,
      author: ref("Person"),
    },
    ["id", "comment", "authorId"],
  ),
  Activity: object(
    {
      id: uuid,
      userId: uuid,
      taskId: uuid,
      description: string,
      hours: { type: "number" },
      activityDate: timestamp,
      createdAt: timestamp,
      user: ref("Person"),
      taskVersion: { type: "integer" },
    },
    ["id", "hours", "taskId"],
  ),
  History: object(
    {
      id: uuid,
      taskId: uuid,
      fromStatus: { ...status, nullable: true },
      toStatus: status,
      changedBy: uuid,
      createdAt: timestamp,
      actor: ref("Person"),
    },
    ["id", "taskId", "toStatus"],
  ),
  Notification: object(
    {
      id: uuid,
      userId: uuid,
      type: string,
      title: string,
      message: string,
      entityType: string,
      entityId: string,
      dedupeKey: { ...string, nullable: true },
      isRead: { type: "boolean" },
      createdAt: timestamp,
      readAt: { ...timestamp, nullable: true },
    },
    ["id", "title", "message", "isRead"],
  ),
  Audit: object(
    {
      id: uuid,
      actorId: uuid,
      action: string,
      entity: string,
      entityId: string,
      metadata: { type: "object", additionalProperties: true },
      ipAddress: { ...string, nullable: true },
      createdAt: timestamp,
      actor: ref("Person"),
    },
    ["id", "action", "entity", "entityId", "createdAt"],
  ),
  Dashboard: object(
    {
      scope: role,
      totalEmployees: { type: "integer" },
      activeEmployees: { type: "integer" },
      totalTeams: { type: "integer" },
      totalTasks: { type: "integer" },
      completedTasks: { type: "integer" },
      overdueTasks: { type: "integer" },
      dueToday: { type: "integer" },
      actualHours: { type: "number" },
      estimatedHours: { type: "number" },
      tasksByStatus: {
        type: "array",
        items: object({ status, count: { type: "integer" } }),
      },
      tasksByPriority: {
        type: "array",
        items: object({ priority, count: { type: "integer" } }),
      },
      recentTasks: { type: "array", items: ref("Task") },
      workload: {
        type: "array",
        items: object({
          assigneeId: uuid,
          openTasks: { type: "integer" },
          estimatedHours: { type: "number" },
        }),
      },
    },
    ["scope", "totalTasks", "completedTasks", "overdueTasks"],
  ),
  Role: object(
    {
      id: uuid,
      name: role,
      createdAt: timestamp,
      permissions: { type: "array", items: string },
    },
    ["id", "name", "permissions"],
  ),
};
schemas.UserUpdate = {
  ...schemas.UserCreate,
  properties: Object.fromEntries(
    Object.entries(schemas.UserCreate.properties).filter(
      ([k]) => k !== "employeeCode",
    ),
  ),
  required: [],
  minProperties: 1,
};
schemas.TeamUpdate = { ...schemas.TeamCreate, required: [], minProperties: 1 };
schemas.ProjectUpdate = {
  ...schemas.ProjectCreate,
  properties: Object.fromEntries(
    Object.entries(schemas.ProjectCreate.properties).filter(
      ([k]) => k !== "teamId",
    ),
  ),
  required: [],
  minProperties: 1,
};
schemas.TaskUpdate = {
  ...schemas.TaskCreate,
  properties: {
    ...schemas.TaskCreate.properties,
    version: { type: "integer", minimum: 1 },
  },
  required: ["version"],
  minProperties: 2,
};
for (const name of ["UserUpdate", "TeamUpdate", "ProjectUpdate"])
  delete schemas[name].required;
const parameter = (name, schema, description) => ({
  name,
  in: "query",
  schema,
  description,
});
const paging = [
  parameter("page", {
    type: "integer",
    minimum: 1,
    maximum: 100000,
    default: 1,
  }),
  parameter("limit", {
    type: "integer",
    minimum: 1,
    maximum: 100,
    default: 20,
  }),
  parameter("sortOrder", enumOf(["asc", "desc"])),
];
const paged = (name, extra = [], sorts = ["createdAt"]) => [
  ...paging,
  parameter("sortBy", enumOf(sorts)),
  ...extra,
];
const search = parameter("search", { type: "string", maxLength: 100 });
const paths = {};
const errors = Object.fromEntries(
  [
    [400, "Validation failure"],
    [401, "Authentication required"],
    [403, "Forbidden"],
    [404, "Not found"],
    [409, "Conflict; refetch task after TASK_VERSION_CONFLICT"],
    [429, "Rate limit"],
    [500, "Internal error"],
  ].map(([code, description]) => [
    code,
    { description, content: { "application/json": { schema: ref("Error") } } },
  ]),
);
function add(
  path,
  method,
  tag,
  summary,
  {
    body,
    data = { type: "object" },
    list = false,
    query = [],
    security,
    description = "",
    created = false,
    csrf = false,
  } = {},
) {
  const parameters = [
    ...Array.from(path.matchAll(/\{([^}]+)\}/g), (m) => ({
      name: m[1],
      in: "path",
      required: true,
      schema: uuid,
    })),
    ...query,
    ...(csrf
      ? [
          {
            name: "X-CSRF-Protection",
            in: "header",
            required: true,
            schema: { type: "string", enum: ["1"] },
          },
        ]
      : []),
  ];
  const envelope = list
    ? object(
        {
          success: { type: "boolean", enum: [true] },
          data: { type: "array", items: data },
          meta: object({
            page: { type: "integer" },
            limit: { type: "integer" },
            total: { type: "integer" },
            totalPages: { type: "integer" },
          }),
        },
        ["success", "data", "meta"],
      )
    : object({ success: { type: "boolean", enum: [true] }, data }, [
        "success",
        "data",
      ]);
  paths[path] ??= {};
  paths[path][method] = {
    tags: [tag],
    summary,
    description,
    ...(security ? { security } : {}),
    parameters,
    ...(body
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: body } },
          },
        }
      : {}),
    responses: {
      [created ? 201 : 200]: {
        description: "Success",
        content: { "application/json": { schema: envelope } },
      },
      ...errors,
    },
  };
}
add(
  "/notifications/push-config",
  "get",
  "Notifications",
  "Get the current user's OneSignal configuration",
  {
    data: object(
      {
        enabled: { type: "boolean" },
        appId: uuid,
        externalId: string,
        preference: { type: "boolean" },
      },
      ["enabled"],
    ),
    description:
      "Requires a Bearer token. Returns only this user's opaque push alias and public App ID; never the App API key. Disabled channels return enabled=false.",
  },
);
add(
  "/notifications/push-preference",
  "patch",
  "Notifications",
  "Set this user's push preference",
  {
    body: object({ enabled: { type: "boolean" } }),
    data: object({ enabled: { type: "boolean" } }),
    description:
      "Authenticated account-wide push preference. Delivery workers check it again before sending. Browser permission is separate.",
  },
);
add("/auth/login", "post", "Auth", "Sign in and create a refresh session", {
  body: ref("Login"),
  data: ref("Tokens"),
  security: [],
  csrf: true,
  description:
    "Sets HttpOnly orbit_refresh cookie. Access JWT is returned in JSON. The refresh token itself is never returned in JSON.",
});
add("/auth/refresh", "post", "Auth", "Rotate refresh token", {
  data: ref("Tokens"),
  security: [{ refreshCookie: [] }],
  csrf: true,
  description:
    "Consumes the previous cookie. Reuse revokes the refresh family. Coordinate refresh calls across browser tabs.",
});
add("/auth/logout", "post", "Auth", "Revoke the current refresh session", {
  security: [{ refreshCookie: [] }],
  csrf: true,
  data: object({ loggedOut: { type: "boolean" } }),
});
add("/auth/me", "get", "Auth", "Read the authenticated user", {
  data: ref("User"),
});
add("/users", "get", "Users", "List permitted users", {
  list: true,
  data: ref("User"),
  query: paged(
    "User",
    [
      search,
      parameter("role", role),
      parameter("teamId", uuid),
      parameter("status", enumOf(["ACTIVE", "ON_LEAVE", "INACTIVE"])),
      parameter("isActive", enumOf(["true", "false"])),
    ],
    ["name", "email", "joiningDate", "createdAt"],
  ),
});
add("/users", "post", "Users", "Create an account (Admin)", {
  body: ref("UserCreate"),
  data: ref("User"),
  created: true,
});
add("/users/{id}", "get", "Users", "Read a permitted user", {
  data: ref("User"),
});
add("/users/{id}", "patch", "Users", "Update employee details (Admin)", {
  body: ref("UserUpdate"),
  data: ref("User"),
});
add(
  "/users/{id}/status",
  "patch",
  "Users",
  "Activate or deactivate an account (Admin)",
  {
    body: object({ isActive: { type: "boolean" } }, ["isActive"]),
    data: ref("User"),
  },
);
add("/users/{id}/role", "patch", "Users", "Assign a system role (Admin)", {
  body: object({ role }, ["role"]),
  data: ref("User"),
  description:
    "Role changes revoke existing sessions. Arbitrary custom roles are not part of this PRD.",
});
add("/roles", "get", "Roles", "List system roles and capabilities (Admin)", {
  data: { type: "array", items: ref("Role") },
});
add("/teams", "get", "Teams", "List permitted teams", {
  list: true,
  data: ref("Team"),
  query: paged("Team", [search], ["name", "createdAt"]),
});
add("/teams", "post", "Teams", "Create team (Admin)", {
  body: ref("TeamCreate"),
  data: ref("Team"),
  created: true,
});
add("/teams/{id}", "get", "Teams", "Read a permitted team", {
  data: ref("Team"),
});
add("/teams/{id}", "patch", "Teams", "Update team (Admin)", {
  body: ref("TeamUpdate"),
  data: ref("Team"),
});
add("/teams/{id}/members", "post", "Teams", "Add a team member (Admin)", {
  body: object({ userId: uuid }, ["userId"]),
  created: true,
});
add(
  "/teams/{id}/members/{userId}",
  "delete",
  "Teams",
  "Remove team member (Admin)",
  { description: "Returns 409 while the member has open tasks in this team." },
);
add("/projects", "get", "Projects", "List permitted projects", {
  data: ref("Project"),
  list: true,
  query: paged(
    "Project",
    [
      search,
      parameter("teamId", uuid),
      parameter("status", schemas.Project.properties.status),
    ],
    ["name", "createdAt", "status"],
  ),
});
add("/projects", "post", "Projects", "Create project (Admin/Manager)", {
  body: ref("ProjectCreate"),
  data: ref("Project"),
  created: true,
});
add("/projects/{id}", "get", "Projects", "Read a permitted project", {
  data: ref("Project"),
});
add("/projects/{id}", "patch", "Projects", "Update a permitted project", {
  body: ref("ProjectUpdate"),
  data: ref("Project"),
});
add(
  "/tasks",
  "get",
  "Tasks",
  "List scoped tasks with SQL filtering and pagination",
  {
    data: ref("Task"),
    list: true,
    query: paged(
      "Task",
      [
        search,
        parameter("status", status),
        parameter("priority", priority),
        ...["assigneeId", "teamId", "projectId"].map((k) => parameter(k, uuid)),
        ...["dueDate", "dueFrom", "dueTo"].map((k) => parameter(k, date)),
      ],
      ["dueDate", "createdAt", "updatedAt", "title", "priority", "status"],
    ),
  },
);
add("/tasks", "post", "Tasks", "Create and assign a task (Admin/Manager)", {
  body: ref("TaskCreate"),
  data: ref("Task"),
  created: true,
});
add("/tasks/{id}", "get", "Tasks", "Read a permitted task", {
  data: ref("Task"),
});
add(
  "/tasks/{id}",
  "patch",
  "Tasks",
  "Update task fields with optimistic concurrency",
  { body: ref("TaskUpdate"), data: ref("Task") },
);
add("/tasks/{id}/status", "patch", "Tasks", "Transition task status", {
  body: ref("StatusUpdate"),
  data: ref("Task"),
  description:
    "Employees may start, block, resume, or submit assigned work for review. Managers/Admins approve completion, cancel, and reopen. Supply the most recently read version.",
});
add("/tasks/{id}", "delete", "Tasks", "Soft-delete task with version check", {
  body: object({ version: { type: "integer", minimum: 1 } }, ["version"]),
});
add(
  "/tasks/{id}/comments",
  "get",
  "Comments",
  "Read comments on a permitted task",
  { data: ref("Comment"), list: true, query: paged("Comment") },
);
add("/tasks/{id}/comments", "post", "Comments", "Comment on a permitted task", {
  body: object(
    {
      comment: { type: "string", minLength: 1, maxLength: 5000 },
      clientRequestId: uuid,
    },
    ["comment"],
  ),
  data: ref("Comment"),
  created: true,
});
add(
  "/tasks/{id}/activities",
  "get",
  "Activities",
  "Read task work activities",
  {
    data: ref("Activity"),
    list: true,
    query: paged("Activity", [], ["createdAt", "activityDate"]),
  },
);
add(
  "/tasks/{id}/activities",
  "post",
  "Activities",
  "Log work and atomically update actual hours",
  {
    body: object(
      {
        description: { type: "string", minLength: 3, maxLength: 2000 },
        hours: { type: "number", minimum: 0.01, maximum: 24, multipleOf: 0.01 },
        activityDate: date,
        version: { type: "integer", minimum: 1 },
      },
      ["description", "hours", "activityDate", "version"],
    ),
    data: ref("Activity"),
    created: true,
  },
);
add(
  "/tasks/{id}/history",
  "get",
  "Activities",
  "Read immutable status history",
  { data: ref("History"), list: true, query: paged("History") },
);
add("/notifications", "get", "Notifications", "Read only your notifications", {
  data: ref("Notification"),
  list: true,
  query: paged("Notification", [
    parameter("isRead", enumOf(["true", "false"])),
  ]),
});
add(
  "/notifications/unread-count",
  "get",
  "Notifications",
  "Count unread notifications",
  { data: object({ unread: { type: "integer" } }) },
);
add(
  "/notifications/{id}/read",
  "patch",
  "Notifications",
  "Mark your notification read",
);
add(
  "/notifications/read-all",
  "patch",
  "Notifications",
  "Mark all your notifications read",
);
add(
  "/dashboard",
  "get",
  "Dashboard",
  "Aggregate metrics according to the authenticated role",
  { data: ref("Dashboard") },
);
add(
  "/reports",
  "get",
  "Dashboard",
  "Workspace or managed-team summary (Admin/Manager)",
  { data: ref("Dashboard") },
);
add("/audit-logs", "get", "Audit", "Read immutable audit logs (Admin)", {
  data: ref("Audit"),
  list: true,
  query: paged(
    "Audit",
    [
      search,
      parameter("actorId", uuid),
      parameter("action", string),
      parameter("entity", enumOf(["User", "Team", "Project", "Task"])),
      parameter("entityId", string),
      parameter("date", date),
    ],
    ["createdAt", "action", "entity"],
  ),
});
export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "Orbit Workforce API",
    version: "1.0.0",
    description:
      "JavaScript + Express + Prisma API. System roles: ADMIN, MANAGER, EMPLOYEE. All protected endpoints use Bearer JWTs. IDs are UUIDs. Mutations are transactional; task writes require a version. Date-only inputs use YYYY-MM-DD and responses serialize as ISO timestamps. No deployment is part of this package.",
  },
  servers: [{ url: "http://localhost:4000/api/v1", description: "Local API" }],
  security: [{ bearerAuth: [] }],
  tags: [
    "Auth",
    "Users",
    "Roles",
    "Teams",
    "Projects",
    "Tasks",
    "Comments",
    "Activities",
    "Notifications",
    "Dashboard",
    "Audit",
  ].map((name) => ({ name })),
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      refreshCookie: { type: "apiKey", in: "cookie", name: "orbit_refresh" },
    },
    schemas,
  },
  paths,
};
