/** Client-side adapter example for the previously delivered Next.js app.
 * Keep this module in a client-only context. Never persist accessToken in storage.
 * Complete the response/field mappings listed in docs/FRONTEND-INTEGRATION.md.
 */
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";
let accessToken: string | null = null;
let refreshing: Promise<void> | null = null;
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
type Envelope<T> = {
  success: true;
  data: T;
  meta?: { page: number; limit: number; total: number; totalPages: number };
};
async function unwrap<T>(response: Response): Promise<Envelope<T>> {
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      result.error?.code || "REQUEST_FAILED",
      result.error?.message || "Request failed.",
    );
  return result;
}
export async function login(email: string, password: string, remember = true) {
  const result = await unwrap<{ user: unknown; accessToken: string }>(
    await fetch(API + "/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", "X-CSRF-Protection": "1" },
      body: JSON.stringify({ email, password, remember }),
    }),
  );
  accessToken = result.data.accessToken;
  return result.data.user;
}
export async function restoreSession() {
  if (!refreshing)
    refreshing = (async () => {
      try {
        const result = await unwrap<{ accessToken: string }>(
          await fetch(API + "/auth/refresh", {
            method: "POST",
            credentials: "include",
            headers: { "X-CSRF-Protection": "1" },
          }),
        );
        accessToken = result.data.accessToken;
      } catch (error) {
        accessToken = null;
        throw error;
      } finally {
        refreshing = null;
      }
    })();
  return refreshing;
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<Envelope<T>> {
  if (!accessToken) await restoreSession();
  const response = await fetch(API + path, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (response.status === 401 && retry) {
    await restoreSession();
    return api<T>(path, options, false);
  }
  return unwrap<T>(response);
}
export async function logout() {
  await unwrap(
    await fetch(API + "/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: { "X-CSRF-Protection": "1" },
    }),
  );
  accessToken = null;
}
export function pageForFrontend<T>(result: Envelope<T[]>) {
  if (!result.meta) throw new Error("Expected pagination metadata");
  return {
    items: result.data,
    page: result.meta.page,
    limit: result.meta.limit,
    total: result.meta.total,
    pages: result.meta.totalPages,
  };
}
// Refetch the task on 409. Do not blindly retry with a new version: show the conflict.
export async function changeTaskStatus(
  id: string,
  status: string,
  version: number,
) {
  return api(`/tasks/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, version }),
  });
}

// Read only for the Socket.IO handshake; keep the token in this module's memory.
export function getAccessToken() {
  return accessToken;
}
