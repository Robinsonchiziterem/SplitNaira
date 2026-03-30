import type { RequestHandler } from "express";
import { z, type ZodTypeAny } from "zod";
import { ApiError } from "./api-error.js";

interface ValidationSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

/**
 * Builds structured validation details from a ZodError.
 *
 * Each issue is mapped to a flat object with path, message, and code
 * so the frontend can display field-level errors.
 */
function buildValidationDetails(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code
  }));
}

/**
 * Express middleware that validates request body, params, and/or query
 * against the provided Zod schemas.
 *
 * On success the parsed (and potentially transformed) values are written
 * back to `req.body` / `req.params` / `req.query` so downstream handlers
 * receive clean, typed data.
 *
 * On failure an `ApiError` is thrown which the central error handler in
 * `middleware/error.ts` serialises into the consistent
 * `{ error, message, details, requestId }` response shape.
 */
export function validateRequest(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as typeof req.query;
      }
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        next(ApiError.validationError(
          "Request validation failed.",
          buildValidationDetails(error)
        ));
        return;
      }
      next(error);
    }
  };
}
