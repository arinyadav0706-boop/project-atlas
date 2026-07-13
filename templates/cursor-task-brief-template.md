# Cursor Task Brief: <Module Name>

Paste this into Cursor (chat or composer) at the start of a module's
implementation. Cursor auto-loads `.cursor/rules/project-atlas.mdc` in
this repo, so architecture/style rules don't need repeating here — this
brief only needs to point at the *specific* sources of truth for this
task and name the reference implementation to mirror.

---

**Build the `<module>` feature.**

Read these first, in order, before writing any code:
1. `docs/02_Modules/<NN_module>.md` — business rules, acceptance criteria,
   validation rules for this module. This is the spec; don't add or skip
   behavior it doesn't describe.
2. `docs/03_Database/01_Database_Design.md` — the exact fields/relations
   you're allowed to touch for this module's entities. Do not add a
   column or table.
3. `docs/04_API/openapi.yaml` — the exact endpoints/request/response
   shapes to implement. Do not add or rename an endpoint.
4. `src/features/authentication/` — the reference implementation from
   Phase 3. Mirror its folder layout (`repositories/`, `services/`,
   `validation/`, `types/`, `api/`) and its pattern (Route Handler → thin
   `api/*.handlers.ts` → service enforces RBAC/business rules → repository
   is the only place touching Prisma).

Scope for this pass: <list the specific acceptance criteria / endpoints
you want built in this task — don't hand over the whole module doc as one
undifferentiated task if it's large; slice it the same way the roadmap
sequences modules>.

If something in the module doc conflicts with what you find in the schema
or API spec, or requires inventing a field/endpoint that isn't documented,
**stop and flag it** — don't guess and don't silently add scaffolding
beyond what's asked.
