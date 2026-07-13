# Business Requirements Document (BRD) — EAGLES V1

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-10

---

## 1. Business Context

The organization currently relies on (or is evaluating) Jira Free for
project/issue tracking. As headcount approaches 500 employees, per-seat
SaaS licensing and Atlassian's platform constraints become a cost and
control liability. The business case for EAGLES is:

1. **Cost control** — eliminate per-seat licensing; run on infrastructure
   the company already controls or can control (Azure).
2. **Data ownership** — company data (issues, comments, attachments) lives
   in a database the company owns, not a third-party SaaS silo.
3. **Extensibility** — the company can extend the tool to its own workflows
   (future: Teams/GitHub integration, custom automation) without waiting on
   a vendor roadmap.

## 2. Business Objectives

| # | Objective | Measure of success |
|---|---|---|
| BO-1 | Fully replace Jira Free for internal use | 100% of active projects migrated within 2 quarters of V1 GA |
| BO-2 | Keep run cost predictable and low | Infra spend < $100/month in production at 500-user scale |
| BO-3 | Avoid vendor/platform lock-in | Can redeploy from Vercel/Supabase to Azure/Docker with no code rewrite |
| BO-4 | Keep the system operable by a small team | A new engineer can onboard using `docs/` alone within 1 week |
| BO-5 | Preserve a path to commercialize (SaaS) | Core schema and auth are multi-tenant-ready without a V1 rewrite |

## 3. Stakeholders

| Stakeholder | Interest |
|---|---|
| Founders (Product/Business owners) | Feature completeness vs. Jira Free, cost, timeline to internal GA |
| Employees (end users) | Usability, speed, low friction migrating from Jira |
| IT/Security (future hire) | SSO, RBAC, audit logging, data residency |
| Founding CTO (this role) | Technical feasibility, maintainability, security, architecture integrity |

## 4. Business Rules (org-wide, cross-module)

- BR-1: Every user must belong to exactly one organization (V1: exactly one
  org exists).
- BR-2: A user cannot be permanently deleted; deactivation is soft-delete
  only, preserving audit history and issue attribution.
- BR-3: Only users with the `ADMIN` org role may invite/deactivate users or
  change role assignments.
- BR-4: Every project must have at least one `PROJECT_LEAD`; the system must
  prevent removing the last lead from a project.
- BR-5: Deleting a project is a soft delete; issues are retained for
  compliance/audit and are excluded from active views.

## 5. Success Metrics (Business)

- Time-to-first-issue-created for a new employee < 5 minutes from account
  creation.
- Support ticket volume related to the tool trends down quarter-over-quarter
  post-GA (proxy for usability vs. Jira).
- Zero critical security incidents (unauthorized data access) in the first
  two quarters.

## 6. Constraints

- Team: 2 founders, ~6 months of software experience, assisted by AI
  engineering tooling (Claude, Cursor) — this drives the requirement for
  simple, well-documented architecture over maximal feature scope.
- Budget: < $40/month development, < $100/month initial production.
- Timeline: V1 scope is intentionally bounded to the 16-module MVP list in
  the PRD to keep delivery achievable by this team size.

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Small team underestimates auth/security complexity | High | Use Auth.js + established OIDC providers rather than building custom auth |
| Feature creep toward full Jira parity | Medium | Hard MVP/V2 boundary enforced in PRD; V2 items explicitly deferred |
| Vendor lock-in to Vercel/Supabase | Medium | Repository pattern + storage adapter interface (NFR-8); Docker Compose parity from day one |
| Data model requiring rework for SaaS later | Medium | `Organization` entity present from V1 (see Vision §8, A1) |
