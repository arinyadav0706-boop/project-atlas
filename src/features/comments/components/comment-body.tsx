import * as React from "react";
import { cn } from "@/shared/lib/utils";
import { parseBlocks, type Block, type Inline } from "@/features/comments/lib/markdown";

// Renders a comment body: the Markdown subset in `lib/markdown.ts`, with
// `@[Name](user:id)` tokens as chips (ADR-0038 §1, CMT-4).
//
// The XSS boundary is unchanged and still deliberate. The parser hands back
// plain data; every leaf below is rendered as a React child, which escapes.
// Nothing here goes near `dangerouslySetInnerHTML`, so a body containing
// `<script>` is still visible characters rather than a tag — adding Markdown
// did not widen the surface, which is the bar the previous version of this
// comment set for it.
//
// The one thing Markdown does add is link hrefs, and the parser refuses any
// scheme outside http/https/mailto (and in-app relative paths), emitting the
// text literally instead. `rel="noreferrer"` keeps the destination from seeing
// where the reader came from.

function InlineNodes({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.kind) {
          case "text":
            return <React.Fragment key={i}>{node.text}</React.Fragment>;
          case "mention":
            return (
              <span
                key={i}
                // A chip, not a link: profile routes are per-user and a mention
                // of a deactivated colleague should still read cleanly rather
                // than dangling.
                className="mx-px inline-block rounded bg-accent/15 px-1 font-medium text-accent"
              >
                @{node.name}
              </span>
            );
          case "code":
            return (
              <code
                key={i}
                className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground"
              >
                {node.text}
              </code>
            );
          case "strong":
            return (
              <strong key={i} className="font-semibold">
                <InlineNodes nodes={node.children} />
              </strong>
            );
          case "em":
            return (
              <em key={i}>
                <InlineNodes nodes={node.children} />
              </em>
            );
          case "strike":
            return (
              <s key={i} className="text-muted-foreground">
                <InlineNodes nodes={node.children} />
              </s>
            );
          case "link":
            return (
              <a
                key={i}
                href={node.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline underline-offset-2 hover:text-accent/80"
              >
                <InlineNodes nodes={node.children} />
              </a>
            );
        }
      })}
    </>
  );
}

function BlockNode({ block }: { block: Block }) {
  switch (block.kind) {
    case "paragraph":
      // `whitespace-pre-wrap` keeps the single newlines the parser preserved.
      return (
        <p className="whitespace-pre-wrap">
          <InlineNodes nodes={block.children} />
        </p>
      );
    case "codeBlock":
      return (
        <pre className="overflow-x-auto rounded-xl bg-muted p-3 font-mono text-[0.85em] leading-relaxed text-foreground">
          <code>{block.text}</code>
        </pre>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-border pl-3 italic text-muted-foreground">
          <span className="whitespace-pre-wrap">
            <InlineNodes nodes={block.children} />
          </span>
        </blockquote>
      );
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <Tag
          className={cn(
            "ml-5 space-y-1",
            block.ordered ? "list-decimal" : "list-disc",
          )}
        >
          {block.items.map((item, i) => (
            <li key={i}>
              <InlineNodes nodes={item} />
            </li>
          ))}
        </Tag>
      );
    }
  }
}

export function CommentBody({ body, className }: { body: string; className?: string }) {
  const blocks = parseBlocks(body);
  return (
    // `space-y-2` rather than a margin per block: a comment is usually one
    // paragraph, and the spacing should not depend on which block type happens
    // to be first.
    <div className={cn("space-y-2", className)}>
      {blocks.map((block, i) => (
        <BlockNode key={i} block={block} />
      ))}
    </div>
  );
}
