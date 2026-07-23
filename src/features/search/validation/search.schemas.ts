import { z } from "zod";

// The query param (12_search.md Validation). Trimmed; 1–100 chars accepted so
// the client can bind to every keystroke. Queries shorter than MIN_QUERY_LEN
// after trimming short-circuit to empty results in the service (BR-5) rather
// than erroring — a 1-char keystroke is not a validation failure.
export const MIN_QUERY_LEN = 2;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
