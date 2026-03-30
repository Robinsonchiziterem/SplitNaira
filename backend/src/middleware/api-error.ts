/**
 * Structured error class for consistent API error responses.
 *
 * Every error surfaced to the client follows the shape:
 *   { error: string, message: string, details?: unknown, requestId?: string }
 *
 * Throw an ApiError from any route or service and the central error handler
 * will serialise it automatically.
 */
export interface ApiErrorBody {
  error: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  /** Serialise to the canonical JSON body. */
  toBody(requestId?: string): ApiErrorBody {
    const body: ApiErrorBody = {
      error: this.code,
      message: this.message,
    };
    if (this.details !== undefined) {
      body.details = this.details;
    }
    if (requestId) {
      body.requestId = requestId;
    }
    return body;
  }

  // --- Factory helpers for common error types ---

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, "bad_request", message, details);
  }

  static validationError(message: string, details?: unknown) {
    return new ApiError(400, "validation_error", message, details);
  }

  static notFound(message: string) {
    return new ApiError(404, "not_found", message);
  }

  static unauthorized(message: string) {
    return new ApiError(403, "unauthorized", message);
  }

  static conflict(message: string, details?: unknown) {
    return new ApiError(409, "conflict", message, details);
  }

  static internal(message = "Unexpected server error.") {
    return new ApiError(500, "internal_error", message);
  }

  static configError(message: string) {
    return new ApiError(503, "config_error", message);
  }

  static sorobanError(statusCode: number, code: string, message: string, rawError?: string) {
    return new ApiError(statusCode, code, message, rawError);
  }
}
