"use client";
// Copy beside frontend-client.ts; install socket.io-client in the frontend.
import { io } from "socket.io-client";
import { getAccessToken, restoreSession } from "./frontend-client";

type Ack<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
export type Comment = {
  id: string;
  comment: string;
  taskId: string;
  author: { id: string; name: string };
  createdAt: string;
};
type Callbacks = {
  onCommentsChanged: (taskId: string) => void;
  onNotificationsChanged: () => void;
  onResync: () => void; // Refetch comments, notifications and unread count after every reconnect.
  onError: (error: Error) => void;
};
export async function connectLive(callbacks: Callbacks) {
  if (!getAccessToken()) await restoreSession();
  const socket = io(
    process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000",
    {
      transports: ["websocket"],
      autoConnect: false,
      auth: (cb) => cb({ token: getAccessToken() }),
    },
  );
  const tasks = new Set<string>();
  let stopped = false;
  let recovering = false;
  async function request<T>(event: string, payload: unknown): Promise<T> {
    if (!socket.connected)
      throw new Error("Live connection is offline. Reconnect before sending.");
    const result = (await socket
      .timeout(10000)
      .emitWithAck(event, payload)) as Ack<T>;
    if (!result.ok)
      throw new Error(`${result.error.code}: ${result.error.message}`);
    return result.data;
  }
  socket.on("connect", () => {
    void (async () => {
      for (const taskId of tasks) await request("task:subscribe", { taskId });
      callbacks.onResync();
    })().catch(callbacks.onError);
  });
  socket.on("comment:created", (event: { taskId: string }) =>
    callbacks.onCommentsChanged(event.taskId),
  );
  socket.on("notification:created", () => callbacks.onNotificationsChanged());
  async function refreshAndConnect() {
    if (stopped || recovering) return;
    recovering = true;
    try {
      await restoreSession();
      if (!stopped) socket.connect();
    } catch (error) {
      callbacks.onError(
        error instanceof Error ? error : new Error("Session restore failed"),
      );
    } finally {
      recovering = false;
    }
  }
  socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect") void refreshAndConnect();
  });
  socket.on("connect_error", (error) => {
    if (error.message === "UNAUTHENTICATED") void refreshAndConnect();
    else callbacks.onError(error);
  });
  socket.connect();
  return {
    socket,
    async subscribe(taskId: string) {
      tasks.add(taskId);
      if (socket.connected) return request("task:subscribe", { taskId });
    },
    async unsubscribe(taskId: string) {
      tasks.delete(taskId);
      if (socket.connected) return request("task:unsubscribe", { taskId });
    },
    // Generate crypto.randomUUID() ONCE per composed message. Reuse it after an uncertain ack.
    createComment(taskId: string, comment: string, clientRequestId: string) {
      return request<Comment>("comment:create", {
        taskId,
        comment,
        clientRequestId,
      });
    },
    stop() {
      stopped = true;
      socket.disconnect();
      socket.removeAllListeners();
    },
  };
}
