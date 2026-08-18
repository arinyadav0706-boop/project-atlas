// A bounded Markdown subset for comment bodies (CMT-4).
//
// `Comment.bodyFormat` has said `MARKDOWN` since the table was created, but
// nothing ever rendered it: `**bold**` reached the reader as four literal
// asterisks. This module closes that gap.
//
// ── Why not react-markdown ───────────────────────────────────────────────────
//
// Because the mention grammar collides with Markdown's. A mention is stored as
// `@[Display Name](user:abc123)`, which to any CommonMark parser is a link
// whose href is `user:abc123` with a stray `@` in front. Using a general parser
// therefore means writing a custom remark plugin, or pre-splitting the body on
// mentions and parsing each fragment separately — and pre-splitting silently
// breaks any emphasis that spans a mention (`**hi @[A](user:1) there**`).
//
// Parsing both grammars in ONE pass, with mentions matched first, is less code
// than the plugin would be and has no such seam.
//
// ── The safety property ──────────────────────────────────────────────────────
//
// This produces a tree of plain data. It never produces an HTML string, so the
// renderer never needs `dangerouslySetInnerHTML` and there is nothing for a
// sanitiser to sanitise. `<script>alert(1)</script>` in a body comes out as one
// text node and React escapes it, exactly as before this change. The one real
// injection surface Markdown adds is the link href — `[click](javascript:…)` —
// and that is handled by an explicit scheme allowlist below, tested.
//
// Deliberately NOT supported: headings, tables, images, raw HTML, footnotes,
// nested lists. Comments are short. Every one of those is a feature to add on
// request, not scaffolding to carry now (CLAUDE.md rule 10).

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "mention"; userId: string; name: string }
  | { kind: "code"; text: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "em"; children: Inline[] }
  | { kind: "strike"; children: Inline[] }
  | { kind: "link"; href: string; children: Inline[] };

export type Block =
  | { kind: "paragraph"; children: Inline[] }
  | { kind: "codeBlock"; text: string; lang: string | null }
  | { kind: "quote"; children: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] };

// Only schemes that cannot execute script. `javascript:`, `data:` and `vbscript:`
// are the ones that can, and they are the reason this list is an allowlist
// rather than a denylist — a denylist loses to `JaVaScRiPt:` and to whatever
// scheme the next browser adds.
const SAFE_SCHEME = /^(https?:\/\/|mailto:)/i;

/** Relative links stay in-app; anything else must declare a safe scheme. */
function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  if (trimmed.startsWith("/")) return true;
  return SAFE_SCHEME.test(trimmed);
}

// One alternation, scanned left to right. Order inside it IS the precedence
// when two rules could match at the same index:
//   mention before link  — `@[a](user:1)` must not become a link
//   code before emphasis — `` `**x**` `` is literal asterisks in code
//   strong before em     — `**x**` is not `*` + `*x*` + `*`
//
// The `(?!\s)` / `(?<!\s)` guards on each emphasis rule are CommonMark's
// flanking condition, and they are not cosmetic: without them `2 * 3 * 4 = 24`
// renders as "2  3  4 = 24", because `* 3 *` matches and the asterisks are
// consumed as italic markers. A delimiter hugging whitespace is arithmetic, or
// a bullet someone typed mid-sentence — not emphasis.
//
// Every quantifier is bounded and lazy, and none is nested inside another
// quantifier, so there is no backtracking blow-up on a hostile body.
const INLINE = new RegExp(
  [
    /@\[(?<mName>[^\]\n]{1,80})\]\(user:(?<mId>[a-zA-Z0-9_-]{1,64})\)/.source,
    /`(?<code>[^`\n]{1,500})`/.source,
    /\*\*(?!\s)(?<strong>[\s\S]{1,500}?)(?<!\s)\*\*/.source,
    /~~(?!\s)(?<strike>[\s\S]{1,500}?)(?<!\s)~~/.source,
    /(?<!\*)\*(?![\s*])(?<em>[^*\n]{1,500}?)(?<!\s)\*(?!\*)/.source,
    /(?<!\w)_(?!\s)(?<em2>[^_\n]{1,500}?)(?<!\s)_(?!\w)/.source,
    /\[(?<linkText>[^\]\n]{0,200})\]\((?<href>[^()\s]{1,2000})\)/.source,
  ].join("|"),
  "g",
);

// Emphasis can contain emphasis, but not forever. Four is deeper than any real
// comment and stops a crafted body from recursing the renderer to death.
const MAX_DEPTH = 4;

export function parseInline(text: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  if (text === "") return out;
  if (depth >= MAX_DEPTH) return [{ kind: "text", text }];

  let cursor = 0;
  INLINE.lastIndex = 0;

  for (const match of text.matchAll(INLINE)) {
    const g = match.groups!;
    const start = match.index;

    // A link whose href we will not honour is not a link. Emit the whole thing
    // as literal text so the reader sees what was written rather than a
    // silently disarmed control.
    if (g.href !== undefined && !isSafeHref(g.href)) continue;

    if (start > cursor) out.push({ kind: "text", text: text.slice(cursor, start) });

    if (g.mName !== undefined) {
      out.push({ kind: "mention", name: g.mName, userId: g.mId! });
    } else if (g.code !== undefined) {
      // Literal by definition — no recursion.
      out.push({ kind: "code", text: g.code });
    } else if (g.strong !== undefined) {
      out.push({ kind: "strong", children: parseInline(g.strong, depth + 1) });
    } else if (g.strike !== undefined) {
      out.push({ kind: "strike", children: parseInline(g.strike, depth + 1) });
    } else if (g.em !== undefined || g.em2 !== undefined) {
      out.push({ kind: "em", children: parseInline((g.em ?? g.em2)!, depth + 1) });
    } else if (g.href !== undefined) {
      out.push({
        kind: "link",
        href: g.href.trim(),
        children: parseInline(g.linkText || g.href, depth + 1),
      });
    }

    cursor = start + match[0].length;
  }

  if (cursor < text.length) out.push({ kind: "text", text: text.slice(cursor) });
  return out;
}

const FENCE = /^```(\w{0,20})\s*$/;
const BULLET = /^[-*]\s+(.*)$/;
const ORDERED = /^\d{1,3}[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;

/**
 * Block structure, line by line.
 *
 * A hand-written line scanner rather than a grammar because the subset is
 * flat: no nesting means no stack, and the whole thing stays readable.
 */
export function parseBlocks(body: string): Block[] {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // Fenced code. An unterminated fence runs to the end of the body rather
    // than falling back to paragraphs — that matches what every editor shows
    // while you are still typing the closing fence.
    const fence = FENCE.exec(line.trim());
    if (fence) {
      const lang = fence[1] ? fence[1] : null;
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i]!.trim())) {
        buf.push(lines[i]!);
        i += 1;
      }
      i += 1; // consume the closing fence (or run off the end harmlessly)
      blocks.push({ kind: "codeBlock", text: buf.join("\n"), lang });
      continue;
    }

    if (QUOTE.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]!)) {
        buf.push(QUOTE.exec(lines[i]!)![1]!);
        i += 1;
      }
      blocks.push({ kind: "quote", children: parseInline(buf.join("\n")) });
      continue;
    }

    const ordered = ORDERED.test(line);
    if (ordered || BULLET.test(line)) {
      const pattern = ordered ? ORDERED : BULLET;
      const items: Inline[][] = [];
      while (i < lines.length && pattern.test(lines[i]!)) {
        items.push(parseInline(pattern.exec(lines[i]!)![1]!));
        i += 1;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    // Paragraph: everything up to a blank line or the start of another block.
    const buf: string[] = [];
    while (i < lines.length) {
      const l = lines[i]!;
      if (
        l.trim() === "" ||
        FENCE.test(l.trim()) ||
        QUOTE.test(l) ||
        BULLET.test(l) ||
        ORDERED.test(l)
      ) {
        break;
      }
      buf.push(l);
      i += 1;
    }
    // Single newlines inside a paragraph are kept as line breaks. GitHub does
    // the same in comments, and people press Enter expecting one.
    blocks.push({ kind: "paragraph", children: parseInline(buf.join("\n")) });
  }

  return blocks;
}
