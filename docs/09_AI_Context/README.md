# AI Context Packs

This folder documents how our AI engineering team (Claude, Cursor) is
configured to work on this codebase, and links to the actual rule files.

| AI Tool | Role | Rule file |
|---|---|---|
| Claude / Claude Code | Founding CTO — architecture, documentation, code generation, review | [`/CLAUDE.md`](../../CLAUDE.md) (repo root, required location for Claude Code to auto-load it) |
| Cursor | Senior Software Engineer — in-editor implementation | [`/.cursor/rules/project-atlas.mdc`](../../.cursor/rules/project-atlas.mdc) |
| GitHub | Version control, CI (GitHub Actions) | `.github/workflows/` (Phase 3) |

## Why rules live at the repo root, not only here

Claude Code auto-loads `CLAUDE.md` from the repository root, and Cursor
auto-loads `.cursor/rules/*.mdc`. Duplicating the full rule text here would
create drift between the doc and the actual enforced rule. This page is the
index/explanation; the root files are the source of truth.

## Principle

Both AI tools are held to the same non-negotiables: documentation before
code, no invented tables/APIs, feature-first architecture, repository
pattern, server-side RBAC, strict TypeScript, Zod validation everywhere,
and portability (no Vercel/Supabase-only lock-in). See `CLAUDE.md` for the
full numbered list.
