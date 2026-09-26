import { assert } from "../../utils/errors.js";
import { authorizeTask } from "../../middleware/authorize.js";
import { transaction } from "../../utils/transaction.js";
import { personSelect } from "../../utils/user.js";
import { appendAudit } from "../audit/audit.repository.js";
import { taskNotification } from "../notifications/notification.repository.js";
import { commentRepository } from "./comment.repository.js";
import { enqueueEvent } from "../../jobs/outbox.repository.js";
import { publishLiveEvent } from "../../realtime/server.js";

const serializeComment = (c) => ({
  ...c,
  body: c.comment,
  createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : "",
});

export function commentService(db) {
  return {
    async list(user, id, q) {
      await authorizeTask(db, user, id);
      const res = await commentRepository(db).list(id, q);
      return {
        ...res,
        data: (res.data || []).map(serializeComment),
      };
    },
    create: async (user, id, data, ctx) => {
      const commentText = data.comment || data.body;
      const previous = async (tx) => {
        if (!data.clientRequestId) return null;
        const saved = await tx.taskComment.findUnique({
          where: {
            authorId_clientRequestId: {
              authorId: user.id,
              clientRequestId: data.clientRequestId,
            },
          },
          include: { author: { select: personSelect } },
        });
        if (saved)
          assert(
            saved.taskId === id && saved.comment === commentText,
            409,
            "COMMENT_REQUEST_CONFLICT",
            "Use a new clientRequestId for a different comment.",
          );
        return saved ? serializeComment(saved) : null;
      };
      try {
        return await transaction(db, async (tx) => {
          const task = await authorizeTask(tx, user, id);
          const existing = await previous(tx);
          if (existing) return existing;
          const comment = await tx.taskComment.create({
            data: {
              taskId: id,
              authorId: user.id,
              comment: commentText,
              clientRequestId: data.clientRequestId,
            },
            include: { author: { select: personSelect } },
          });
          await enqueueEvent(tx, "COMMENT_LIVE", `comment-${comment.id}`, {
            taskId: id,
            commentId: comment.id,
          });
          await appendAudit(
            tx,
            user,
            "TASK_COMMENTED",
            "Task",
            id,
            { commentId: comment.id },
            ctx,
          );
          for (const recipientId of new Set([
            task.assigneeId,
            task.team?.managerId,
          ])) {
            if (recipientId && recipientId !== user.id) {
              await taskNotification(
                tx,
                { ...task, assigneeId: recipientId },
                "TASK_COMMENTED",
                "New comment on a task",
              );
            }
          }
          const serialized = serializeComment(comment);
          publishLiveEvent({
            kind: "COMMENT_LIVE",
            taskId: id,
            commentId: comment.id,
            comment: serialized,
          });
          return serialized;
        });
      } catch (error) {
        if (error.code === "P2002" && data.clientRequestId) {
          await authorizeTask(db, user, id);
          const existing = await previous(db);
          if (existing) return existing;
        }
        throw error;
      }
    },
  };
}
