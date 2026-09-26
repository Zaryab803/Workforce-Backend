# Product Requirements Document — Backend

## 1. Project Overview

**Product:** Workforce & Task Management Platform  
**Runtime:** Node.js  
**Framework:** Express.js  
**Language:** JavaScript  
**API:** REST  
**Database:** Supabase PostgreSQL  
**ORM:** Prisma  
**Authentication:** JWT + refresh sessions  
**Queue:** BullMQ  
**Cache/Queue Backend:** Redis  
**API Documentation:** Swagger/OpenAPI

Backend architecture:

```text
Next.js Frontend
       ↓
Express REST API
       ↓
Authentication + RBAC
       ↓
Services / Business Logic
       ↓
Prisma
       ↓
Supabase PostgreSQL
```

Supabase will primarily provide the managed PostgreSQL infrastructure. Business rules and authorization remain inside Express.

---

# 2. Backend Goals

The API must provide:

- Authentication
- Refresh-session management
- Role-based authorization
- User/employee management
- Team management
- Project/task management
- Task status workflow
- Task comments
- Activity recording
- Notifications
- Audit logging
- Dashboard aggregation
- Search/filter/sort
- Pagination
- Background processing
- Validation
- Consistent error handling
- Concurrency protection
- API documentation
- Automated testing

The company explicitly requires backend-enforced authorization rather than relying on hidden frontend controls.

---

# 3. Technology Stack

| Area | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Language | JavaScript |
| Database | Supabase PostgreSQL |
| ORM | Prisma |
| Validation | Zod |
| Authentication | JWT |
| Password Hashing | bcrypt |
| Queue | BullMQ |
| Queue Backend | Redis |
| Logging | Pino |
| API Documentation | Swagger/OpenAPI |
| Security | Helmet |
| Rate Limiting | express-rate-limit |
| Testing | Jest |
| API Testing | Supertest |
| E2E | Playwright from frontend/project |
| Deployment | Render/Railway/Fly.io |

---

# 4. Backend Architecture

Use feature-based modular architecture.

```text
backend/
├── src/
│   ├── config/
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── teams/
│   │   ├── projects/
│   │   ├── tasks/
│   │   ├── comments/
│   │   ├── notifications/
│   │   ├── activities/
│   │   ├── audit/
│   │   └── dashboard/
│   │
│   ├── middleware/
│   ├── utils/
│   ├── jobs/
│   ├── workers/
│   ├── docs/
│   ├── app.js
│   └── server.js
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.js
│
├── tests/
├── .env.example
├── Dockerfile
└── package.json
```

Each feature should follow approximately:

```text
tasks/
├── task.route.js
├── task.controller.js
├── task.service.js
├── task.repository.js
├── task.schema.js
└── task.constant.js
```

---

# 5. Responsibility Separation

## Route

Defines:

```text
HTTP method
URL
Middleware
Controller
```

## Controller

Handles:

```text
Request
Response
HTTP status
```

Controllers should remain thin.

## Service

Contains:

```text
Business rules
Permission checks
Transactions
Workflow
```

## Repository

Contains:

```text
Prisma/database queries
```

## Schema

Contains Zod request validation.

---

# 6. Database

Use the PostgreSQL instance provided by Supabase.

Recommended connection:

```text
Express
   ↓
Prisma Client
   ↓
Supabase PostgreSQL
```

Do not expose Supabase service-role credentials to Next.js.

---

# 7. Main Database Entities

The assignment specifically calls for relational entities such as users, roles, teams, team members, tasks, comments, history, audit logs, refresh sessions and notifications.

Recommended schema:

```text
users
roles
teams
team_members
projects
tasks
task_comments
task_status_history
work_activities
audit_logs
refresh_sessions
notifications
```

---

# 8. Users

Recommended fields:

```text
id UUID
employee_code VARCHAR UNIQUE

name VARCHAR
email VARCHAR UNIQUE
password_hash VARCHAR

phone VARCHAR

role_id UUID
manager_id UUID NULL

joining_date DATE
employment_status ENUM
avatar_url TEXT

is_active BOOLEAN

created_at TIMESTAMP
updated_at TIMESTAMP
deleted_at TIMESTAMP NULL
```

Never return `password_hash`.

---

# 9. Roles

Initial roles:

```text
ADMIN
MANAGER
EMPLOYEE
```

Recommended:

```text
roles
-----
id
name
created_at
```

Roles should not be trusted simply because the client sends a role value.

The authenticated database user determines authorization.

---

# 10. Teams

```text
teams
-----
id
name
description
manager_id
created_at
updated_at
```

Many-to-many membership:

```text
team_members
------------
id
team_id
user_id
joined_at
```

Unique constraint:

```text
(team_id, user_id)
```

---

# 11. Projects

Tasks contain a project relationship, so use:

```text
projects
--------
id
name
description
status
created_by
created_at
updated_at
```

Possible statuses:

```text
ACTIVE
ON_HOLD
COMPLETED
ARCHIVED
```

---

# 12. Tasks

The assignment defines task information and allowed status/priority values.

```text
tasks
-----
id

title
description

project_id
assignee_id
created_by

priority
status

due_date

estimated_hours
actual_hours

version

created_at
updated_at
deleted_at
```

Status:

```text
TODO
IN_PROGRESS
BLOCKED
IN_REVIEW
COMPLETED
CANCELLED
```

Priority:

```text
LOW
MEDIUM
HIGH
URGENT
```

---

# 13. Optimistic Concurrency

The assignment specifically requires handling simultaneous task updates without silently overwriting data.

Add:

```text
version INTEGER DEFAULT 1
```

When client reads:

```json
{
  "id": "task-123",
  "version": 4
}
```

When updating:

```json
{
  "status": "IN_REVIEW",
  "version": 4
}
```

Database update must effectively verify:

```text
WHERE
id = taskId
AND
version = 4
```

Successful update:

```text
version = 5
```

If no row matches:

```http
409 Conflict
```

Response:

```json
{
  "success": false,
  "error": {
    "code": "TASK_VERSION_CONFLICT",
    "message": "This task was modified by another user."
  }
}
```

Frontend should then refetch the latest task.

---

# 14. Task Comments

```text
task_comments
-------------
id
task_id
author_id
comment
created_at
updated_at
```

Users may only comment on tasks they are authorized to access.

---

# 15. Task Status History

```text
task_status_history
-------------------
id
task_id
from_status
to_status
changed_by
created_at
```

Every status change should create history.

---

# 16. Work Activity

Employees can record work/activity.

```text
work_activities
---------------
id
user_id
task_id
description
hours
activity_date
created_at
```

Managers may view activity for authorized team members.

---

# 17. Authentication

## Login

Endpoint:

```http
POST /api/v1/auth/login
```

Request:

```json
{
  "email": "employee@example.com",
  "password": "password"
}
```

Flow:

```text
Validate request
      ↓
Find user
      ↓
Check active status
      ↓
bcrypt.compare()
      ↓
Generate access JWT
      ↓
Generate refresh session
      ↓
Return user + access token
```

The assignment requires secure passwords plus access-token and refresh/session strategy.

---

# 18. Refresh Sessions

Table:

```text
refresh_sessions
----------------
id
user_id
token_hash
expires_at
revoked_at
created_at
ip_address
user_agent
```

Do not store raw refresh tokens.

Store their hash.

Endpoint:

```http
POST /api/v1/auth/refresh
```

Logout:

```http
POST /api/v1/auth/logout
```

Logout revokes the current session.

---

# 19. Current User

```http
GET /api/v1/auth/me
```

Returns:

```json
{
  "success": true,
  "data": {
    "id": "...",
    "name": "Zaryab",
    "email": "...",
    "role": "MANAGER"
  }
}
```

---

# 20. Authorization Middleware

Recommended:

```text
authenticate()
authorizeRoles()
authorizeResource()
```

Example:

```js
router.post(
  "/tasks",
  authenticate,
  authorizeRoles("ADMIN", "MANAGER"),
  createTask
);
```

But role checks alone are not enough.

Example:

```text
Manager requests Task 123
          ↓
Is manager authenticated?
          ↓
Is Task 123 owned by manager's permitted team?
          ↓
YES → continue
NO → 403
```

This prevents IDOR attacks.

---

# 21. Role Permissions

## Admin

Can:

```text
Manage users
Manage teams
Manage roles
Create tasks
Assign tasks
View all tasks
View reports
View audit logs
```

## Manager

Can:

```text
View team members
Create tasks
Assign tasks to permitted team
Modify priority/deadline
Monitor team tasks
View team reports
```

## Employee

Can:

```text
View own tasks
Update permitted task status
Add comments
Record work activity
View own dashboard
```

---

# 22. Authentication API

```text
POST /api/v1/auth/login

POST /api/v1/auth/refresh

POST /api/v1/auth/logout

GET /api/v1/auth/me
```

---

# 23. User API

```text
GET    /api/v1/users

POST   /api/v1/users

GET    /api/v1/users/:id

PATCH  /api/v1/users/:id

PATCH  /api/v1/users/:id/status
```

Admin creates accounts.

Server-side query example:

```text
GET /api/v1/users
?page=1
&limit=20
&search=zaryab
&role=EMPLOYEE
&teamId=...
&status=ACTIVE
```

---

# 24. Team API

```text
GET    /api/v1/teams

POST   /api/v1/teams

GET    /api/v1/teams/:id

PATCH  /api/v1/teams/:id

POST   /api/v1/teams/:id/members

DELETE /api/v1/teams/:id/members/:userId
```

---

# 25. Project API

```text
GET    /api/v1/projects

POST   /api/v1/projects

GET    /api/v1/projects/:id

PATCH  /api/v1/projects/:id
```

---

# 26. Task API

```text
GET    /api/v1/tasks

POST   /api/v1/tasks

GET    /api/v1/tasks/:id

PATCH  /api/v1/tasks/:id

PATCH  /api/v1/tasks/:id/status

DELETE /api/v1/tasks/:id
```

Example filters follow the required API pattern:

```text
GET /api/v1/tasks
?page=1
&limit=20
&status=IN_PROGRESS
&priority=HIGH
&assigneeId=...
&search=invoice
&sortBy=dueDate
&sortOrder=asc
```

The assignment requires versioned REST endpoints, validation, consistent errors, pagination metadata, authentication and authorization.

---

# 27. Comments API

```text
GET  /api/v1/tasks/:id/comments

POST /api/v1/tasks/:id/comments
```

---

# 28. Work Activity API

```text
GET  /api/v1/tasks/:id/activities

POST /api/v1/tasks/:id/activities
```

---

# 29. Dashboard API

```text
GET /api/v1/dashboard
```

Backend detects the user's role.

For Admin:

```json
{
  "totalEmployees": 100,
  "activeEmployees": 92,
  "totalTeams": 8,
  "totalTasks": 500,
  "completedTasks": 290,
  "overdueTasks": 35
}
```

For Manager:

Return only permitted team statistics.

For Employee:

Return only personal task statistics.

---

# 30. Notification Model

```text
notifications
-------------
id
user_id
type
title
message
entity_type
entity_id
is_read
created_at
read_at
```

Endpoints:

```text
GET   /api/v1/notifications

PATCH /api/v1/notifications/:id/read

PATCH /api/v1/notifications/read-all
```

---

# 31. Background Processing

The assignment requires at least one asynchronous job with a queue, worker, retries, failure handling and logging.

Use:

```text
Redis
+
BullMQ
```

Primary worker:

```text
Daily Overdue Task Processor
```

Flow:

```text
Scheduled job
     ↓
Find overdue tasks
     ↓
Create notification jobs
     ↓
BullMQ queue
     ↓
Notification worker
     ↓
Database notification
```

Worker requirements:

```text
Retry handling
Failure logging
Idempotency
Graceful shutdown
```

---

# 32. Audit Logs

```text
audit_logs
----------
id
actor_id
action
entity
entity_id
metadata JSONB
ip_address
created_at
```

Actions:

```text
USER_CREATED
USER_UPDATED
USER_DEACTIVATED

TASK_CREATED
TASK_ASSIGNED
TASK_UPDATED
TASK_STATUS_CHANGED
TASK_COMPLETED

TEAM_CREATED
TEAM_MEMBER_ADDED
TEAM_MEMBER_REMOVED
```

The source specification requires audit records to be immutable from normal application workflows.

There should therefore be no standard:

```text
DELETE /audit-logs/:id
```

endpoint.

---

# 33. Transactions

Operations involving multiple dependent database writes should use transactions.

Example task status update:

```text
Begin transaction
      ↓
Update task
      ↓
Insert task_status_history
      ↓
Insert audit_log
      ↓
Create notification/event
      ↓
Commit
```

If an important step fails:

```text
Rollback
```

---

# 34. Validation

Use Zod at API boundaries.

Validate:

```text
Email
Password strength
UUIDs
Required fields
Enums
Dates
Pagination
Sort fields
Task status
Task priority
Team assignment
Actual/estimated hours
```

Client-side validation must never replace API validation.

---

# 35. Standard Success Response

Recommended:

```json
{
  "success": true,
  "data": {}
}
```

Paginated:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

---

# 36. Standard Error Response

```json
{
  "success": false,
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task was not found."
  }
}
```

Never expose:

```text
Stack traces
Database passwords
SQL details
Prisma internal errors
JWT secrets
Supabase service role key
```

---

# 37. Central Error Handler

Use:

```text
errorHandler.js
```

Application-specific errors:

```text
AppError

ValidationError
AuthenticationError
AuthorizationError
NotFoundError
ConflictError
```

Example HTTP mapping:

```text
400 INVALID_INPUT

401 UNAUTHENTICATED

403 FORBIDDEN

404 NOT_FOUND

409 CONFLICT

429 RATE_LIMITED

500 INTERNAL_ERROR
```

---

# 38. Security Requirements

The source assignment specifically calls out password security, JWT/session protection, RBAC, validation, injection, XSS, CSRF considerations, rate limiting, CORS, HTTP headers, secrets management and IDOR protection.

Implement:

```text
bcrypt

Helmet

CORS whitelist

Rate limiting

JWT expiry

Refresh-token rotation/revocation

Zod validation

Prisma parameterization

Resource-level authorization

Secure cookies

Environment secrets

Request size limits
```

---

# 39. Database Indexes

Suggested indexes:

```text
users(email)

users(role_id)

team_members(team_id, user_id)

tasks(assignee_id)

tasks(status)

tasks(priority)

tasks(due_date)

tasks(project_id)

tasks(created_by)

task_comments(task_id)

notifications(user_id, is_read)

audit_logs(actor_id)

audit_logs(entity, entity_id)

audit_logs(created_at)
```

Indexes should be verified against actual queries.

---

# 40. Search and Pagination

Do not load all records into memory.

Example:

```text
?page=1
&limit=20
```

Set maximum limit:

```text
100
```

Search should run in PostgreSQL.

For MVP:

```text
ILIKE
```

Future enhancement:

```text
PostgreSQL Full Text Search
```

---

# 41. Logging

Use Pino.

Log:

```text
Request ID
HTTP method
URL
Status
Duration
Errors
Worker failures
```

Do not log:

```text
Passwords
JWTs
Refresh tokens
Sensitive personal information
```

---

# 42. Swagger

Expose documentation such as:

```text
/api/docs
```

Document:

- Authentication
- Users
- Teams
- Projects
- Tasks
- Comments
- Notifications
- Dashboard
- Audit Logs

Include:

```text
Request examples
Response examples
Authentication requirements
Error responses
```

---

# 43. Testing

## Unit Tests

Test:

```text
Authentication logic
Password checking
JWT logic
RBAC
Task creation
Task assignment
Status transition
Permission checks
```

## Integration Tests

Using Supertest:

```text
Login

Refresh token

Create task

Assign task

Update task

Unauthorized access

Forbidden resource access

Pagination

Filtering

Concurrent update conflict
```

The assignment treats testing as a core evaluation area rather than an optional feature.

---

# 44. Environment Configuration

`.env.example`:

```text
NODE_ENV=

PORT=

DATABASE_URL=
DIRECT_URL=

JWT_ACCESS_SECRET=
JWT_ACCESS_EXPIRES_IN=

JWT_REFRESH_SECRET=
JWT_REFRESH_EXPIRES_IN=

REDIS_URL=

FRONTEND_URL=

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Only include Supabase service credentials if they are actually needed by backend functionality.

Never expose:

```text
SUPABASE_SERVICE_ROLE_KEY
```

to the frontend.

---

# 45. Docker Services

Recommended:

```text
frontend
backend
redis
worker
```

Because PostgreSQL is hosted by Supabase, local production-like development does not necessarily require a PostgreSQL Docker container unless you intentionally support a fully local database environment.

---

# 46. CI/CD

GitHub Actions:

```text
Push / Pull Request
       ↓
Install
       ↓
Lint
       ↓
Backend tests
       ↓
Frontend typecheck
       ↓
Frontend tests
       ↓
Build frontend
       ↓
Build/check backend
       ↓
E2E
```

Failure at any required stage should fail CI.

---

# 47. Deployment

Recommended:

```text
Frontend
Vercel

Backend
Render / Railway

Database
Supabase PostgreSQL

Redis
Upstash / Railway Redis / Redis Cloud
```

Production domains could follow:

```text
https://app.example.com

https://api.example.com
```

Configure CORS only for approved frontend origins.

---

# 48. Backend Definition of Done

Backend is complete when:

- Login/logout work
- Refresh sessions work
- Passwords are securely hashed
- RBAC works
- Resource-level authorization works
- User CRUD works
- Team management works
- Project management works
- Task workflow works
- Status history works
- Comments work
- Work activity works
- Notifications work
- Audit logging works
- Dashboard APIs work
- Search/filter/sort work
- Pagination works
- Optimistic concurrency works
- Background worker runs
- Validation works
- Error handling is centralized
- Rate limiting/security middleware work
- Swagger documentation is available
- Unit/integration tests pass
- `.env.example` exists
- Docker support exists
- CI pipeline passes
- Production deployment works