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

export function toHttpStatus(error: unknown): number {
  if (error instanceof ForbiddenError) return 403;
  if (error instanceof NotFoundError) return 404;
  if (error instanceof ValidationError) return 422;
  if (error instanceof ConflictError) return 409;
  return 500;
}
