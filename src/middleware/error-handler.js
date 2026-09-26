import { ZodError } from "zod";
import { AppError } from "../utils/errors.js";
import { logger } from "../config/logger.js";
export function errorHandler(error, req, res, _next) {
  let status = 500,
    code = "INTERNAL_ERROR",
    message = "An unexpected error occurred.",
    details;
  if (error instanceof AppError) {
    ({ status, code, message, details } = error);
  } else if (error instanceof ZodError) {
    status = 400;
    code = "INVALID_INPUT";
    message = "Check the request fields.";
    details = error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
  } else if (error.type === "entity.parse.failed") {
    status = 400;
    code = "INVALID_JSON";
    message = "Request body must be valid JSON.";
  } else if (error.type === "entity.too.large") {
    status = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "The request body is too large.";
  } else if (error.code === "P2002") {
    status = 409;
    code = "DUPLICATE_RECORD";
    message = "A record with these unique fields already exists.";
  } else if (error.code === "P2003") {
    status = 409;
    code = "RELATION_CONFLICT";
    message = "A referenced record is missing or is still in use.";
  } else if (error.code === "P2025") {
    status = 404;
    code = "NOT_FOUND";
    message = "The requested record was not found.";
  } else if (error.code === "P2034") {
    status = 409;
    code = "TRANSACTION_CONFLICT";
    message = "Another request changed this data. Refresh and try again.";
  }
  if (status >= 500)
    logger.error(
      { requestId: req.id, code: error.code || error.name },
      "Request failed",
    );
  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      requestId: req.id,
    },
  });
}
