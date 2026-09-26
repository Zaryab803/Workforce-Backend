import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { idParams } from "../../utils/schema.js";
import { commentCreate, commentQuery } from "./comment.schema.js";
import { commentService } from "./comment.service.js";
import { commentController } from "./comment.controller.js";
export function commentRoutes(db) {
  const r = Router(),
    c = commentController(commentService(db));
  r.get(
    "/:id/comments",
    validate({ params: idParams, query: commentQuery }),
    c.list,
  );
  r.post(
    "/:id/comments",
    validate({ params: idParams, body: commentCreate }),
    c.create,
  );
  return r;
}
