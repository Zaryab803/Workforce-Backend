# Connect the earlier frontend to this backend

The previously delivered frontend had a **local demo API**. This backend implements your newer backend PRD. Changing the API URL alone is not enough: request and response shapes differ.

## 1. Configure the base URL and client

Set this in the frontend `.env.local` and restart Next.js:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

Use the included `examples/frontend-client.ts` as the basis for the frontend fetch adapter. It stores the access token in module memory, uses the HttpOnly refresh cookie, sends `Authorization: Bearer ...`, and retries once after an expired-access-token response. Do not put access or refresh tokens into Zustand persistence or localStorage.

Call `restoreSession()` on a fresh app load, then `/auth/me`. Login now returns `{success:true,data:{user,accessToken,tokenType}}`. Clear TanStack Query data when logging out or switching users.

The sample deduplicates refresh calls **within one browser tab**. With multiple tabs, implement a Web Locks/BroadcastChannel coordinator or a same-origin server session/BFF. Two simultaneous refreshes consuming the same old cookie intentionally trigger replay protection. Do not bypass reuse detection on the backend to hide a frontend race.

## 2. Update the service mappings

| Earlier demo                                | Backend contract                                          | Frontend change                                                               |
| ------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `/employees`                                | `/users`                                                  | Change paths in `usersApi`                                                    |
| Plain JSON response                         | `{success,data}`                                          | Unwrap `data`                                                                 |
| `{items,total,page,limit,pages}`            | `{success,data:[],meta:{page,limit,total,totalPages}}`    | Use `pageForFrontend()`                                                       |
| Role cookie session only                    | Bearer access JWT + refresh cookie                        | Use the new auth client                                                       |
| `joined`                                    | `joiningDate`                                             | Map date input/output                                                         |
| `active`                                    | `isActive`                                                | Map status filters and forms                                                  |
| `avatar`                                    | `avatarUrl`                                               | Map avatar display and forms                                                  |
| One `teamId` on an employee                 | Many `teamIds`                                            | Use multi-select membership UI or keep a documented primary-display choice    |
| `project` free-text name                    | `projectId` UUID + `project.name`                         | Populate project options from `/projects`                                     |
| `creatorId`                                 | `createdBy` + `creator`                                   | Map task details                                                              |
| `ORB-101` task IDs                          | UUID task IDs                                             | Treat IDs as opaque strings                                                   |
| Status-only PATCH                           | `{status,version}`                                        | Store version from each task response                                         |
| Direct actual-hours patch                   | `/tasks/:id/activities`                                   | Send description, hours, activityDate, version                                |
| Comment `{body}`                            | Comment `{comment}`                                       | Rename request field                                                          |
| Task detail embeds comments/activity        | Separate paginated `/comments`, `/activities`, `/history` | Query each tab independently                                                  |
| `PATCH /notifications/all`                  | `PATCH /notifications/read-all`                           | Change endpoint                                                               |
| `PATCH /notifications/:id`                  | `PATCH /notifications/:id/read`                           | Change endpoint                                                               |
| Notification `body`, `read`, `taskId`       | `message`, `isRead`, `entityId`                           | Map notification display and link                                             |
| `PATCH /teams/:id/members` with remove flag | POST members / DELETE members/:userId                     | Change member actions                                                         |
| `/lookups` returns all choices              | Paginated `/users`, `/teams`, `/projects`                 | Use searchable paged selects                                                  |
| Demo dashboard shape                        | Documented `Dashboard` schema                             | Map metrics and charts; backend provides grouped status/priority and workload |

The backend accepts only documented request fields. Do not send the entire frontend employee/task object as a PATCH payload. Build an explicit payload so UI-only fields and protected server fields are excluded.

## 3. Handle task concurrency

When fetching a task, retain its `version`.

```ts
await changeTaskStatus(task.id, "IN_PROGRESS", task.version);
```

When the response is `409 TASK_VERSION_CONFLICT`:

1. Roll back the optimistic board change.
2. Refetch the task and task lists.
3. Tell the user that someone else updated the task.
4. Let the user decide whether to apply their change to the new version.

Do not silently resend a stale form using a newly fetched version. That would recreate the lost-update problem the version check prevents.

## 4. Align status actions with backend rules

| Current status | Admin/Manager next statuses       | Employee next statuses |
| -------------- | --------------------------------- | ---------------------- |
| TODO           | IN_PROGRESS, CANCELLED            | IN_PROGRESS            |
| IN_PROGRESS    | BLOCKED, IN_REVIEW, CANCELLED     | BLOCKED, IN_REVIEW     |
| BLOCKED        | IN_PROGRESS, CANCELLED            | IN_PROGRESS            |
| IN_REVIEW      | IN_PROGRESS, COMPLETED, CANCELLED | IN_PROGRESS            |
| COMPLETED      | IN_PROGRESS                       | None                   |
| CANCELLED      | TODO                              | None                   |

Hide unavailable choices in the UI for clarity. The backend still enforces the same rules on every request.

## 5. Roles and reports

Manager access is determined by `teams.managerId`, not by the user's self-declared role or `managerId` reporting field alone. A Manager can manage only the teams assigned to them. Employees see tasks where they are the assignee.

The backend PRD allows Managers to view team reports. The earlier frontend hides Reports from Managers; update its route/navigation rule if you want to surface `/reports` for Managers. Audit logs remain Admin-only.

## 6. Refresh and logout

Send `credentials:'include'` and `X-CSRF-Protection: 1` on login, refresh, and logout. The access token is not a refresh token. Refresh is single-use rotation: after refreshing, replace the in-memory access token. Logging out revokes that session, and role/password/deactivation changes revoke the affected user's sessions.

This package includes the adapter example and mapping guide. It does not claim that the earlier frontend has already been rewired to the new backend.

## Version 1.1 live integration

Copy `examples/realtime-client.ts`, `examples/onesignal-client.ts` and the public service worker as described in `NOTIFICATIONS-AND-REALTIME.md`. The socket endpoint is on the Express server at `/socket.io`, using WebSocket transport. Use change events to refetch comments, notification lists and unread counts. Subscribe again and refetch after reconnect. Web Push needs browser subscription in addition to backend keys. Stop Socket.IO and call OneSignal logout during sign-out. These adapters are supplied examples; the original Next.js app has not been edited.
