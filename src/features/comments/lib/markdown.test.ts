import { describe, expect, it } from "vitest";
import { parseBlocks, parseInline, type Inline } from "@/features/comments/lib/markdown";

// Flatten to plain text, so a test can assert "what does the reader see"
// without walking the tree by hand.
function text(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.kind) {
        case "text":
          return n.text;
        case "code":
          return n.text;
        case "mention":
          return `@${n.name}`;
        default:
          return text(n.children);
      }
    })
    .join("");
}

describe("inline parsing", () => {
  it("renders bold, italic, strike and code", () => {
    expect(parseInline("**b**")[0]).toMatchObject({ kind: "strong" });
    expect(parseInline("*i*")[0]).toMatchObject({ kind: "em" });
    expect(parseInline("_i_")[0]).toMatchObject({ kind: "em" });
    expect(parseInline("~~s~~")[0]).toMatchObject({ kind: "strike" });
    expect(parseInline("`c`")[0]).toMatchObject({ kind: "code", text: "c" });
  });

  it("prefers strong over em, so ** is not three separate emphasis runs", () => {
    const [node] = parseInline("**bold**");
    expect(node).toMatchObject({ kind: "strong" });
    expect(text([node!])).toBe("bold");
  });

  it("treats markdown inside a code span as literal", () => {
    const nodes = parseInline("`**not bold**`");
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ kind: "code", text: "**not bold**" });
  });

  // CommonMark's flanking rule. Without it `* 3 *` matches and the reader sees
  // "2  3  4 = 24" — the asterisks eaten as italic markers.
  it("leaves markers hugging whitespace as ordinary text", () => {
    expect(text(parseInline("2 * 3 * 4 = 24"))).toBe("2 * 3 * 4 = 24");
    expect(text(parseInline("a ** b"))).toBe("a ** b");
    expect(text(parseInline("rate ~~ 5 ~~ x"))).toBe("rate ~~ 5 ~~ x");
    expect(text(parseInline("_ leading space _"))).toBe("_ leading space _");
  });

  it("does not treat snake_case identifiers as emphasis", () => {
    const nodes = parseInline("call some_long_name now");
    expect(nodes.every((n) => n.kind === "text")).toBe(true);
  });
});

// The reason this module exists rather than a dependency: `@[A](user:1)` is a
// Markdown link with an `@` in front, and a general parser reads it as one.
describe("mentions vs. markdown links", () => {
  it("parses a mention as a mention, not a link to `user:1`", () => {
    const [node] = parseInline("@[Aadhya Krishnan](user:verus-u-062)");
    expect(node).toMatchObject({
      kind: "mention",
      name: "Aadhya Krishnan",
      userId: "verus-u-062",
    });
  });

  it("keeps emphasis that spans a mention", () => {
    const [node] = parseInline("**ping @[Liam](user:u1) today**");
    expect(node).toMatchObject({ kind: "strong" });
    const inner = (node as { children: Inline[] }).children;
    expect(inner.some((n) => n.kind === "mention")).toBe(true);
    expect(text([node!])).toBe("ping @Liam today");
  });

  it("still parses a genuine link beside a mention", () => {
    const nodes = parseInline("@[Liam](user:u1) see [docs](https://e.com)");
    expect(nodes.find((n) => n.kind === "mention")).toBeTruthy();
    expect(nodes.find((n) => n.kind === "link")).toMatchObject({
      href: "https://e.com",
    });
  });
});

// The only injection surface Markdown adds. A rejected link must degrade to
// visible text — never to a link that has been quietly defused, because the
// reader should see what was actually written.
describe("link scheme allowlist", () => {
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "vbscript:msgbox",
  ])("refuses %s", (href) => {
    const nodes = parseInline(`[click](${href})`);
    expect(nodes.some((n) => n.kind === "link")).toBe(false);
    expect(text(nodes)).toBe(`[click](${href})`);
  });

  it.each(["https://e.com", "http://e.com", "mailto:a@e.com", "/projects/1"])(
    "allows %s",
    (href) => {
      expect(parseInline(`[go](${href})`)[0]).toMatchObject({ kind: "link", href });
    },
  );
});

describe("blocks", () => {
  it("splits paragraphs on blank lines and keeps single newlines", () => {
    const blocks = parseBlocks("one\ntwo\n\nthree");
    expect(blocks).toHaveLength(2);
    expect(text((blocks[0] as { children: Inline[] }).children)).toBe("one\ntwo");
  });

  it("reads fenced code verbatim, with its language", () => {
    const [block] = parseBlocks("```ts\nconst a = **1**;\n```");
    expect(block).toMatchObject({
      kind: "codeBlock",
      lang: "ts",
      text: "const a = **1**;",
    });
  });

  it("runs an unterminated fence to the end rather than falling apart", () => {
    const [block] = parseBlocks("```\nstill typing");
    expect(block).toMatchObject({ kind: "codeBlock", text: "still typing" });
  });

  it("parses bullet and numbered lists", () => {
    const [bullets] = parseBlocks("- a\n- b");
    expect(bullets).toMatchObject({ kind: "list", ordered: false });
    expect((bullets as { items: Inline[][] }).items).toHaveLength(2);

    const [numbers] = parseBlocks("1. a\n2. b");
    expect(numbers).toMatchObject({ kind: "list", ordered: true });
  });

  it("parses a blockquote and ends it at the first ordinary line", () => {
    const blocks = parseBlocks("> quoted\nafter");
    expect(blocks[0]).toMatchObject({ kind: "quote" });
    expect(blocks[1]).toMatchObject({ kind: "paragraph" });
  });

  it("returns nothing for an empty or whitespace-only body", () => {
    expect(parseBlocks("")).toEqual([]);
    expect(parseBlocks("   \n\n  ")).toEqual([]);
  });
});

describe("hostile input", () => {
  it("keeps HTML as text — the parser never emits markup", () => {
    const nodes = parseInline('<script>alert("x")</script>');
    expect(nodes.every((n) => n.kind === "text")).toBe(true);
    expect(text(nodes)).toBe('<script>alert("x")</script>');
  });

  it("bounds emphasis nesting instead of recursing without limit", () => {
    const body = "*".repeat(60) + "x" + "*".repeat(60);
    expect(() => parseInline(body)).not.toThrow();
  });

  it("finishes promptly on a long adversarial body", () => {
    const body = ("**a*b~~c`d[e](f" + "\n").repeat(400);
    const started = Date.now();
    parseBlocks(body);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
