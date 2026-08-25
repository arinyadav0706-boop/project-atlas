import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from "@/shared/lib/errors";
import { checkRateLimit, type RateLimitRule } from "@/shared/lib/rate-limit";
import type { Actor } from "@/shared/types/actor";
import type { ApiPage, ApiScope } from "@/features/public-api/types/public-api.types";
import { ApiTokenService } from "@/features/public-api/services/api-token.service";

// The v1 request seam (ADR-0052 §1, §5, §6).
//
// Every public route goes through `v1Route`, which does the five things a
// public API must do identically everywhere: authenticate the token, enforce
// the scope, count the request against a per-token limit, shape the response,
// and turn a domain error into a documented code.
//
// Deliberately NOT `handleRoute` (the app's internal seam). The internal API
// answers `{ error, message }` to our own React components and is free to
// change shape when they do; this one is a contract. Sharing the translator
// would mean a tweak for the UI silently rewriting an integrator's error
// handling — the exact coupling §1 exists to prevent.

/**
 * Per token, per minute.
 *
 * ClickUp allows 100/min on a personal token and Asana 150/min. 120 sits
 * between them and matches the mutation bucket the app already uses, so a
 * script written against the UI's behaviour is not surprised.
 */
export const API_RATE_RULE: RateLimitRule = { limit: 120, windowSec: 60 };

/** Stable machine-readable codes (BR-6). Prose may change; these may not. */
export type ApiErrorCode =
  | "unauthorized"
  | "insufficient_scope"
  | "forbidden"
  | "not_found"
  | "validation_failed"
  | "conflict"
  | "rate_limited"
  | "internal_error";

interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; details?: unknown };
}

class ScopeError extends Error {
  constructor(readonly scope: ApiScope) {
    super(`This token is missing the "${scope}" scope.`);
    this.name = "ScopeError";
  }
}

function errorBody(code: ApiErrorCode, message: string, details?: unknown): ApiErrorBody {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

function translate(error: unknown): { status: number; body: ApiErrorBody } {
  if (error instanceof ScopeError) {
    return { status: 403, body: errorBody("insufficient_scope", error.message) };
  }
  if (error instanceof UnauthorizedError) {
    return { status: 401, body: errorBody("unauthorized", error.message) };
  }
  if (error instanceof ForbiddenError) {
    return { status: 403, body: errorBody("forbidden", error.message) };
  }
  if (error instanceof NotFoundError) {
    return { status: 404, body: errorBody("not_found", error.message) };
  }
  if (error instanceof ConflictError) {
    return { status: 409, body: errorBody("conflict", error.message) };
  }
  if (error instanceof ValidationError) {
    return { status: 422, body: errorBody("validation_failed", error.message) };
  }
  if (error instanceof ZodError) {
    return {
      status: 422,
      body: errorBody(
        "validation_failed",
        "The request body or query is not valid.",
        // Field-level detail, which the internal seam flattens into one string.
        // An integrator debugging at 2am from a curl response needs to know
        // WHICH field, and cannot open our source to find out.
        error.issues.map((issue) => ({
          field: issue.path.join(".") || "(root)",
          message: issue.message,
        })),
      ),
    };
  }
  if (error instanceof RateLimitError) {
    return { status: 429, body: errorBody("rate_limited", error.message) };
  }
  return { status: 500, body: errorBody("internal_error", "Something went wrong.") };
}

export interface V1Context {
  actor: Actor;
  request: NextRequest;
  /** Assert a scope. Throws 403 `insufficient_scope`, naming what is missing. */
  requireScope: (scope: ApiScope) => void;
  /** The query string, already parsed. */
  query: URLSearchParams;
}

/**
 * Wrap a v1 handler.
 *
 * `scope` is the one this route needs; pass `null` for a route any valid token
 * may call (`/me`). Handlers return plain data — the envelope is applied here,
 * so no route can forget it and none can invent its own shape.
 */
export async function v1Route(
  request: NextRequest,
  scope: ApiScope | null,
  handler: (ctx: V1Context) => Promise<unknown>,
): Promise<NextResponse> {
  const started = performance.now();
  let rate: { limit: number; remaining: number; reset: number } | null = null;

  const finish = (response: NextResponse): NextResponse => {
    // On EVERY response, not just 429s (BR-7). A client that can only discover
    // the limit by exceeding it will exceed it, then retry immediately — which
    // is how a polite integration becomes an outage.
    if (rate) {
      response.headers.set("X-RateLimit-Limit", String(rate.limit));
      response.headers.set("X-RateLimit-Remaining", String(rate.remaining));
      response.headers.set("X-RateLimit-Reset", String(rate.reset));
    }
    response.headers.set(
      "Server-Timing",
      `app;dur=${(performance.now() - started).toFixed(1)};desc="server compute"`,
    );
    return response;
  };

  try {
    const auth = await ApiTokenService.authenticate(request.headers.get("authorization"));

    // Per token, so one team's runaway script cannot exhaust another's budget.
    const limit = await checkRateLimit("apiToken", auth.tokenId, API_RATE_RULE);
    rate = {
      limit: API_RATE_RULE.limit,
      remaining: limit.remaining,
      reset: Math.floor(Date.now() / 1000) + limit.retryAfterSec,
    };
    if (!limit.allowed) throw new RateLimitError(limit.retryAfterSec);

    const ctx: V1Context = {
      actor: auth.actor,
      request,
      query: request.nextUrl.searchParams,
      requireScope: (needed) => {
        if (!auth.scopes.includes(needed)) throw new ScopeError(needed);
      },
    };
    if (scope) ctx.requireScope(scope);

    const result = await handler(ctx);
    if (result instanceof NextResponse) return finish(result);
    // One envelope, applied centrally so no route can forget it (BR-6) — and
    // so no route can apply it TWICE. A page already carries `data`, so
    // wrapping it blindly produced `{"data":{"data":[…]}}`; the brand is how
    // the seam tells the two apart rather than trusting each route to.
    if (isPage(result)) {
      // Strip the brand — it is an internal marker, not part of the contract.
      return finish(
        NextResponse.json({ data: result.data, pagination: result.pagination }),
      );
    }
    return finish(NextResponse.json({ data: result }));
  } catch (error) {
    const { status, body } = translate(error);
    if (status === 500) console.error("[api/v1]", error);
    const response = NextResponse.json(body, { status });
    if (error instanceof RateLimitError) {
      response.headers.set("Retry-After", String(error.retryAfterSec));
    }
    if (status === 401) {
      // RFC 9110: a 401 has to say how to authenticate.
      response.headers.set("WWW-Authenticate", 'Bearer realm="EAGLES API"');
    }
    return finish(response);
  }
}

/**
 * Marks a value as already being a page envelope.
 *
 * A brand rather than a duck-typed `"pagination" in result` check: a resource
 * that legitimately has a `pagination` field of its own would otherwise be
 * silently unwrapped, and that bug would be invisible until an integrator
 * reported it.
 */
const PAGE_BRAND = Symbol.for("eagles.v1.page");

type BrandedPage<T> = ApiPage<T> & { [PAGE_BRAND]: true };

function isPage(value: unknown): value is BrandedPage<unknown> {
  return typeof value === "object" && value !== null && PAGE_BRAND in value;
}

/**
 * A page from a service that has already paginated.
 *
 * The internal services return `{ items, nextCursor }`; this is the adapter,
 * so a route never hand-builds the envelope and can never get it subtly wrong.
 */
export function pageOf<T>(items: T[], nextCursor: string | null): ApiPage<T> {
  return {
    data: items,
    pagination: { nextCursor, hasMore: nextCursor !== null },
    [PAGE_BRAND]: true,
  } as BrandedPage<T>;
}

/** A 204, for deletes. */
export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/** A 201 with the standard envelope. */
export function created(data: unknown): NextResponse {
  return NextResponse.json({ data }, { status: 201 });
}

/**
 * Page an already-fetched slice.
 *
 * Callers fetch `take + 1` and hand the whole thing over; this trims and
 * derives the cursor. Keyset, never offset (BR-5): offset re-scans every
 * preceding row per page and — worse — silently skips and repeats items as the
 * underlying list changes, so a nightly export is quietly wrong rather than
 * loudly broken. Jira had to migrate its own search endpoints off `startAt`
 * for exactly this.
 */
export function page<T>(rows: T[], take: number, cursorOf: (row: T) => string): ApiPage<T> {
  const hasMore = rows.length > take;
  const data = hasMore ? rows.slice(0, take) : rows;
  const last = data.at(-1);
  return pageOf(data, hasMore && last ? cursorOf(last) : null);
}

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

/** `?limit=` clamped, so one caller cannot ask for the whole table. */
export function pageSize(query: URLSearchParams): number {
  const raw = Number(query.get("limit"));
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.trunc(raw), MAX_PAGE_SIZE);
}

/** `?cursor=`, blank read as absent — a cleared cursor is not a cursor of "". */
export function cursorOf(query: URLSearchParams): string | undefined {
  return query.get("cursor")?.trim() || undefined;
}
