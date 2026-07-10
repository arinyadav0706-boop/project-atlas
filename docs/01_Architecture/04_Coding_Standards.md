# Coding Standards — EAGLES

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-10

These standards are enforced by ESLint/Prettier/TS config (Phase 3) and by
`CLAUDE.md` / `.cursor/rules/` for AI-assisted contributions.

---

## 1. TypeScript

- `strict: true` in `tsconfig.json`. Never disable strict flags per-file.
- `any` is forbidden. Use `unknown` + narrowing, generics, or a precise
  type. If a third-party type is genuinely unknown, isolate it behind a
  single typed adapter function, not scattered `any`s.
- Prefer `type` for unions/utility shapes, `interface` for object shapes
  that may be extended.
- No non-null assertions (`!`) except immediately after a runtime check
  that guarantees the value (comment why if not obvious).

## 2. Structure & SOLID

- Feature-first folders (see `02_Feature_Architecture.md`). Never create a
  top-level `controllers/`, `models/`, or `utils/` grab-bag.
- Single Responsibility: a service method does one business operation. If a
  method needs a "and also" in its description, split it.
- Repository Pattern: Prisma calls live only in `*.repository.ts` files.
- Service Layer: business rules and RBAC checks live only in `*.service.ts`
  files, never in Route Handlers or React components.
- Dependency direction is one-way: `app/` → `features/*/api` → `services` →
  `repositories` → Prisma. Never the reverse.

## 3. Validation

- Every external input (HTTP body, query params, form input) is validated
  with a Zod schema before use. No manual `if` chains for shape validation.
- The same Zod schema is reused for client-side form validation
  (`zodResolver`) and server-side Route Handler validation — defined once
  per feature in `validation/`.

## 4. Naming

- Files: `kebab-case.ts`, components `PascalCase.tsx`.
- Booleans read as predicates: `isActive`, `hasPermission`, `canEdit`.
- Async functions that hit the network/DB are verbs: `createIssue`,
  `getProjectById` — not `issueData` or `handleIssue`.

## 5. Comments & Documentation

- Code should be self-documenting through naming. Comments explain **why**,
  not what — a hidden constraint, a workaround, a non-obvious invariant.
- No commented-out code committed. No TODO comments without a linked issue.
- Every feature's business rules live in its module doc
  (`docs/02_Modules/<feature>.md`), not scattered as comments.

## 6. Error Handling

- Services throw typed domain errors (e.g., `ForbiddenError`,
  `NotFoundError`, `ValidationError`) defined in `shared/lib/errors.ts`.
- Route Handlers catch domain errors once, at the boundary, and map them to
  HTTP status codes — no per-handler ad hoc `try/catch` translation logic
  duplicated across features.
- Never swallow errors silently. Never catch an error just to `console.log`
  and continue as if nothing happened.

## 7. Security (see also `docs/07_Security/`)

- Every service method that mutates data receives an authenticated `actor`
  and checks RBAC before proceeding — authorization is never assumed from
  UI state.
- All user input rendered in the UI is escaped by default (React does this;
  never use `dangerouslySetInnerHTML` without explicit sanitization and a
  documented reason).
- All Prisma queries use the query builder / parameterized queries — never
  raw string-concatenated SQL.
- Secrets (API keys, DB URLs, OAuth secrets) live in environment variables,
  validated at startup via a Zod-parsed env schema, never committed.

## 8. Testing (baseline, expanded in `docs/08_Testing/`)

- Service layer functions are unit-testable without HTTP or a real
  database where feasible (mock the repository).
- Every module's acceptance criteria (in `docs/02_Modules/*`) map to at
  least one automated test before the module is considered done.

## 9. Git & Review

- Conventional, descriptive commit messages (`feat(issues): add sprint
  assignment`, `fix(auth): correct Entra ID redirect URI`).
- No direct commits to `main`; feature branches + PR review (even solo,
  self-review against this document and the module's acceptance criteria).
- Every PR touching a module should reference the module doc it implements.

## 10. Formatting & Linting

- Prettier is the formatting authority — no manual style debates.
- ESLint config extends `next/core-web-vitals` + `@typescript-eslint`
  strict rules; CI fails the build on lint errors (see
  `docs/06_Infrastructure/`).
