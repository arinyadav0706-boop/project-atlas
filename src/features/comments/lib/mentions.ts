// Mention tokens in a comment body (ADR-0038 §1).
//
// The stored form is `@[Display Name](user:<id>)`. The composer writes it, the
// renderer turns it back into a chip, and this module is the single place that
// knows the shape.
//
// Binding to the id rather than the name is the whole point: display names are
// not unique in a 150-person org, they change, and they contain spaces — so
// `@Arin Yadav` cannot be delimited from the prose after it without guessing.
// A token bound at write time keeps pointing at the person it named, forever.

/** A mention as it appears in the body, in order of appearance. */
export interface ParsedMention {
  userId: string;
  /** The name as it was written — a historical record, not the live name. */
  name: string;
}

export type BodySegment =
  | { kind: "text"; text: string }
  | { kind: "mention"; userId: string; name: string };

// Name: anything but a closing bracket, bounded so a malformed body cannot
// produce a pathological match. Id: cuid-shaped — letters and digits only,
// which also means a token can never smuggle markup through the parser.
const MENTION_PATTERN = /@\[([^\]\n]{1,80})\]\(user:([a-zA-Z0-9_-]{1,64})\)/g;

/** Every distinct user mentioned, first appearance wins for the recorded name. */
export function parseMentions(body: string): ParsedMention[] {
  const seen = new Map<string, ParsedMention>();
  for (const match of body.matchAll(MENTION_PATTERN)) {
    const name = match[1]!;
    const userId = match[2]!;
    if (!seen.has(userId)) seen.set(userId, { userId, name });
  }
  return [...seen.values()];
}

/**
 * The body split into renderable pieces, so the UI never does its own regex
 * over user content and never needs `dangerouslySetInnerHTML`. Text segments
 * stay text — React escapes them — and mentions become elements.
 */
export function segmentBody(body: string): BodySegment[] {
  const segments: BodySegment[] = [];
  let cursor = 0;

  for (const match of body.matchAll(MENTION_PATTERN)) {
    const start = match.index;
    if (start > cursor) {
      segments.push({ kind: "text", text: body.slice(cursor, start) });
    }
    segments.push({ kind: "mention", name: match[1]!, userId: match[2]! });
    cursor = start + match[0].length;
  }

  if (cursor < body.length) {
    segments.push({ kind: "text", text: body.slice(cursor) });
  }
  return segments;
}

/** The token the composer inserts when someone picks a name from autocomplete. */
export function formatMention(user: { id: string; name: string }): string {
  // A `]` in a display name would terminate the token early and turn the rest
  // of the name into prose. Strip rather than escape: the token is a machine
  // format, and the id is what carries meaning.
  const safeName = user.name.replace(/[[\]()\n]/g, "").trim() || "user";
  return `@[${safeName}](user:${user.id})`;
}

/**
 * What the user typed after a bare `@`, if the caret is inside such a run.
 * Returns null when there is no active trigger, which is the common case on
 * every keystroke — so the caller can bail cheaply.
 */
export function activeMentionQuery(
  text: string,
  caret: number,
): { query: string; from: number } | null {
  const upto = text.slice(0, caret);
  const at = upto.lastIndexOf("@");
  if (at === -1) return null;

  // Must start a word: `foo@bar` is an email, not a mention.
  const before = at > 0 ? upto[at - 1]! : " ";
  if (!/[\s(]/.test(before)) return null;

  const query = upto.slice(at + 1);
  // A newline ends the run, and so does a completed token's `]` — otherwise
  // typing after inserting a mention would keep the menu open forever.
  if (/[\n\]]/.test(query)) return null;
  // Bound the query so a long line of prose after a stray "@" is not treated
  // as an ever-growing search term.
  if (query.length > 40) return null;

  return { query, from: at };
}

/** Replace the active `@…` run with a token, returning body + new caret. */
export function insertMention(
  text: string,
  trigger: { from: number },
  caret: number,
  user: { id: string; name: string },
): { text: string; caret: number } {
  const rest = text.slice(caret);
  // A trailing space so the next word does not run into the token — but only
  // when there is not already one, or inserting mid-sentence doubles it up.
  const token = /^\s/.test(rest) ? formatMention(user) : `${formatMention(user)} `;
  return { text: text.slice(0, trigger.from) + token + rest, caret: trigger.from + token.length };
}

/**
 * Storage form → what a person types and reads.
 *
 * The composer must never show `@[Amelia Nair](user:verus-u-062)`. Ids are the
 * right thing to *store* (see the module header) and the wrong thing to put in
 * front of someone, so the draft holds `@Amelia Nair` and the id is reattached
 * on submit from the picks the user actually made.
 */
export function tokensToDisplay(body: string): { text: string; picked: PickedMention[] } {
  const picked: PickedMention[] = [];
  const text = segmentBody(body)
    .map((s) => {
      if (s.kind !== "mention") return s.text;
      picked.push({ name: s.name, userId: s.userId });
      return `@${s.name}`;
    })
    .join("");
  return { text, picked };
}

/** A name the user chose from autocomplete, bound to the id it resolved to. */
export interface PickedMention {
  name: string;
  userId: string;
}

/**
 * Display form → storage form, using only the names the user actually picked.
 *
 * Longest name first, so "Amelia Nair" wins over a colleague called "Amelia"
 * and the shorter match cannot eat the start of the longer one.
 *
 * A name that was picked and then edited by hand simply stops matching and
 * stays literal text. That is the correct failure: it is visible to the writer
 * before they submit, and it never silently notifies the wrong person — which
 * is exactly what resolving names at render time would risk.
 */
export function displayToTokens(text: string, picked: readonly PickedMention[]): string {
  const byLongest = [...picked].sort((a, b) => b.name.length - a.name.length);
  let out = text;
  for (const { name, userId } of byLongest) {
    // Escape the name — display names can contain regex metacharacters.
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // `@Name` only when not already inside a token, and only at a word edge so
    // "@Sam" does not match inside "@Samantha".
    const pattern = new RegExp(`@${escaped}(?![\\w'-])`, "g");
    out = out.replace(pattern, formatMention({ id: userId, name }));
  }
  return out;
}

/**
 * A one-line preview with mentions flattened to `@Name` — for notification
 * messages and list previews, where the raw token would be unreadable.
 */
export function plainPreview(body: string, max = 100): string {
  const flat = segmentBody(body)
    .map((s) => (s.kind === "mention" ? `@${s.name}` : s.text))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
