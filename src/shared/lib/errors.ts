// Domain errors thrown by the service layer, caught once at the Route
// Handler boundary and mapped to HTTP status codes.
// See docs/01_Architecture/04_Coding_Standards.md §6.

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "The requested resource was not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class UnauthorizedError extends Error {
  constructor(message = "Authentication required.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

// Thrown when a caller exceeds a rate-limit bucket (ADR-0028). Carries the
// seconds until the window resets so the Route Handler can set Retry-After.
export class RateLimitError extends Error {
  constructor(
    public readonly retryAfterSec: number,
    message = "Too many requests — please slow down and try again shortly.",
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

export function toHttpStatus(error: unknown): number {
  if (error instanceof UnauthorizedError) return 401;
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof NotFoundError) return 404;
  if (error instanceof ValidationError) return 422;
  if (error instanceof ConflictError) return 409;
  if (error instanceof RateLimitError) return 429;
  return 500;
}
