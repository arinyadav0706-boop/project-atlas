import { segmentBody } from "@/features/comments/lib/mentions";

// Renders a comment body: plain text, with `@[Name](user:id)` tokens turned
// into chips (ADR-0038 §1).
//
// The XSS boundary is unchanged and deliberate: text segments are rendered as
// React children, which escape, and a mention chip is built from an id-shaped
// capture and a name we print as text. Nothing here goes near
// `dangerouslySetInnerHTML`, so a body containing `<script>` stays visible
// characters. When Markdown lands it must clear that bar before it ships.
export function CommentBody({ body, className }: { body: string; className?: string }) {
  return (
    <p className={className}>
      {segmentBody(body).map((segment, i) =>
        segment.kind === "mention" ? (
          <span
            key={`m-${i}`}
            // A chip, not a link: profile routes are per-user and a mention of
            // a deactivated colleague should still read cleanly rather than
            // dangling. Linking is a small follow-up once /users/:id exists.
            className="mx-px inline-block rounded bg-accent/15 px-1 font-medium text-accent"
          >
            @{segment.name}
          </span>
        ) : (
          <span key={`t-${i}`}>{segment.text}</span>
        ),
      )}
    </p>
  );
}
