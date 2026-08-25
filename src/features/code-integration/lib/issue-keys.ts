// Finding issue keys in text a developer wrote (ADR-0053 §3). Pure.
//
// This is the whole trigger for the module — if it is wrong in either
// direction, the feature is either invisible or actively annoying — so it is
// its own file with its own tests rather than a regex inline in the adapter.

/**
 * Candidates, not answers.
 *
 * Deliberately permissive, because the *filter* is the real check. The
 * boundaries matter more than the shape:
 *
 * - `(?<![A-Za-z0-9])` stops `xVWP-1` and, crucially, `AES-256` from yielding
 *   `S-256` — a lookbehind on any alphanumeric, not just a word character,
 *   because `_` is fine to break on but a digit is not.
 * - `(?![0-9])` after the number stops `VWP-1234567890123` being read as a key
 *   only if the trailing part were dropped; with the greedy `\d+` it instead
 *   ensures the whole number is taken.
 * - `\d{1,9}` caps the length: no project has issue 10^10, and an unbounded
 *   match turns a git sha like `ABC-1234567890abc` into a lookup.
 */
const CANDIDATE = /(?<![A-Za-z0-9])([A-Z][A-Z0-9]{0,9})-(\d{1,9})(?![0-9])/g;

export interface IssueKeyMatch {
  key: string;
  projectKey: string;
}

/**
 * Every DISTINCT key in `text` whose project key is one this org actually has.
 *
 * The filter is the point. A generic `[A-Z]+-\d+` over real commit messages
 * links `UTF-8`, `ISO-8601`, `SHA-256`, `RFC-9457`, `CVE-2026-1234` and half of
 * `AES-256-GCM`. A wrong link is worse than a missing one: somebody has to
 * investigate and remove it, and after the second they stop reading the panel.
 *
 * `knownProjectKeys` is compared case-insensitively but the returned key is
 * normalised to the canonical upper-case form, so `vwp-1` in a branch name
 * still finds VWP-1.
 */
export function findIssueKeys(
  text: string | null | undefined,
  knownProjectKeys: Iterable<string>,
): IssueKeyMatch[] {
  if (!text) return [];
  const known = new Map<string, string>();
  for (const key of knownProjectKeys) known.set(key.toUpperCase(), key.toUpperCase());

  const seen = new Set<string>();
  const found: IssueKeyMatch[] = [];
  // Case-insensitive matching happens by upper-casing the haystack: a branch is
  // as likely to be `feature/vwp-1-login` as `feature/VWP-1-login`, and git
  // users are not consistent about it.
  for (const match of text.toUpperCase().matchAll(CANDIDATE)) {
    const projectKey = match[1]!;
    const number = String(Number(match[2]!)); // drops leading zeros: VWP-007 → VWP-7
    const canonical = known.get(projectKey);
    if (!canonical) continue;
    const key = `${canonical}-${number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({ key, projectKey: canonical });
  }
  return found;
}

/** The same, across several pieces of text (branch + title + description). */
export function findIssueKeysIn(
  texts: (string | null | undefined)[],
  knownProjectKeys: Iterable<string>,
): IssueKeyMatch[] {
  const seen = new Set<string>();
  const found: IssueKeyMatch[] = [];
  for (const text of texts) {
    for (const match of findIssueKeys(text, knownProjectKeys)) {
      if (seen.has(match.key)) continue;
      seen.add(match.key);
      found.push(match);
    }
  }
  return found;
}
