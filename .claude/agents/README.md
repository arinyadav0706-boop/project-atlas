# EAGLES subagents

Five agents, each a distinct lane — no overlap. Invoke the one that matches the
job; don't stack them. All are read-only except `qa`, which writes test files
only (never product source).

| Agent | Lane | Use it when… |
|---|---|---|
| **reviewer** | Judges a *plan/spec/diff* before commit — weakest assumption + long-term reversibility | You've drafted a plan or finished a diff and want it attacked before merge |
| **bug-hunter** | Finds *correctness defects* in existing code, with a failing input | Code is written; you want real bugs, not opinions |
| **stress-tester** | The *non-functional* axis — scale, concurrency, performance, security/IDOR, hostile input | A feature will take real traffic, or you want to try to break it |
| **qa** | *Builds and runs* the test safety net (unit / RBAC matrix / API / integration / E2E) | Closing the RBAC matrix or adding integration/E2E to a finished feature |
| **researcher** | *Grounded options* with trade-offs for an open "how should we build X" | Facing a decision and you want researched choices, not the first idea |

## Design notes (why this set)
- **reviewer** replaced the former `challenger` + `futurist` — both critiqued
  decisions pre-commit; one sharp critic covering soundness *and* reversibility
  beats two overlapping ones.
- **qa** was added to fill the biggest gap: nothing previously *wrote and ran*
  tests, only found problems.
- Every agent references our own docs (`CLAUDE.md`, the module docs, the
  performance and roles docs) so its output enforces *our* rules, not generic
  best practice, and every agent has an explicit output contract.
