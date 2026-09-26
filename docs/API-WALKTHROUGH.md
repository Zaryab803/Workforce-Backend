# API walkthrough

Base URL: `http://localhost:4000/api/v1`. Start the database, Redis, API and worker using `README.md`. Swagger at `/api/docs` contains the complete 40-operation contract.

## Responses

Successful single-record responses use `{ "success": true, "data": ... }`. Lists add `meta: {page,limit,total,totalPages}` and return an array in `data`. Errors use `{success:false,error:{code,message,requestId}}`, with validation details when relevant. Important statuses: 400 invalid input, 401 missing/expired session, 403 forbidden action/scope, 404 missing record, 409 version/workflow/uniqueness conflict, 429 rate limit.

## 1. Login and session

POST `/auth/login`, header `X-CSRF-Protection: 1`:

```json
{
  "email": "manager@orbit.demo",
  "password": "YOUR_SEED_PASSWORD",
  "remember": true
}
```

Store `data.accessToken` in memory. The browser must use `credentials: 'include'` to accept/send the refresh cookie. Use `Authorization: Bearer ACCESS_TOKEN` for protected endpoints. GET `/auth/me` gives the current user. POST `/auth/refresh` with credentials and the CSRF header rotates the session. POST `/auth/logout` with the same options revokes it.

## 2. Find users and projects

GET `/users?page=1&limit=20&search=employee` and GET `/projects?page=1&limit=20` return only records in the current user's scope. Use UUID values from these responses; no hardcoded example UUID is required. An Admin can list `/teams` and `/roles`, create users, and assign memberships. Managers can create tasks only for active members of the selected project's team.

## 3. Create a task

POST `/tasks` as Admin or Manager:

```json
{
  "title": "Prepare dashboard summary",
  "description": "Review the draft and write the summary.",
  "projectId": "PROJECT_UUID_FROM_API",
  "assigneeId": "USER_UUID_FROM_API",
  "priority": "HIGH",
  "dueDate": "2026-10-15",
  "estimatedHours": 4
}
```

The response includes the task UUID and `version: 1`. Status starts at `TODO`. Team and creator are server-owned fields.

## 4. Start, log time, and request review

PATCH `/tasks/:id/status` as the assigned Employee:

```json
{ "status": "IN_PROGRESS", "version": 1 }
```

Use the returned version (now 2). POST `/tasks/:id/activities`:

```json
{
  "description": "Prepared the first draft",
  "hours": 1.5,
  "activityDate": "2026-09-25",
  "version": 2
}
```

Use a real work date no later than today in UTC. The response contains the activity and `taskVersion: 3`; use that version for the next task update. POST `/tasks/:id/comments` with `{"comment":"Draft is ready for review."}`. Comments do not change the task version. PATCH status to `IN_REVIEW` with the current version, then have the Manager PATCH to `COMPLETED` with the new version.

An Employee cannot complete or cancel a task. Invalid workflow jumps receive 409; disallowed Employee transitions receive 403 when the transition is otherwise valid. The complete transition table is in `FRONTEND-INTEGRATION.md`.

## 5. Edit and handle conflicts

PATCH `/tasks/:id` as Admin/Manager with `{"title":"Revised title","version":CURRENT_VERSION}`. DELETE `/tasks/:id` also requires a JSON body `{"version":CURRENT_VERSION}`. Do not send a whole fetched task object back: the API rejects protected and unknown fields.

If another request already changed the task, expect `409 TASK_VERSION_CONFLICT`. Refetch `/tasks/:id`, show the current data, and ask the user to reconcile their pending edit. Task activity logs use the same version protection.

## 6. Lists, reports, and notifications

- GET `/tasks?page=1&limit=20&status=IN_PROGRESS&sortBy=dueDate&sortOrder=asc`.
- GET `/tasks/:id/comments`, `/tasks/:id/activities`, `/tasks/:id/history` for paginated related records.
- GET `/dashboard` for role-scoped metrics; GET `/reports` for Admin/Manager aggregates.
- GET `/notifications`; PATCH `/notifications/:id/read` or `/notifications/read-all` marks only your records.
- GET `/audit-logs` as Admin to inspect changes.

See Swagger for allowed query names on each endpoint. User-provided filters never expand permission scope.

## 7. Overdue job

Run the worker in a separate terminal. `npm run jobs:overdue` queues an immediate scan using the configured timezone's current calendar day. For a local test, set a task due date to a prior date and leave it open. The assignee receives a `TASK_OVERDUE` in-app notification. A repeat scan on the same day does not create another record for the same task and assignee.

`examples/requests.http` provides requests to adapt to your local IDs and credentials. It intentionally contains placeholders rather than real passwords or bearer tokens.

## Email, Web Push and Socket.IO

Read `NOTIFICATIONS-AND-REALTIME.md` for provider configuration and the complete live event contract. `GET /notifications/push-config` returns the authenticated user's OneSignal setup. POST comments may include a UUID `clientRequestId` for safe retries.
