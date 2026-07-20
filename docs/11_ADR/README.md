# Architecture Decision Records

ADRs record significant, hard-to-reverse engineering decisions: the
context, the decision, alternatives considered, and consequences. Use
`template.md` for new records. Never edit an accepted ADR's decision in
place — supersede it with a new numbered ADR that links back.

| ID | Title | Status |
|---|---|---|
| [0001](0001-feature-first-modular-monolith.md) | Feature-First Modular Monolith | Accepted |
| [0002](0002-tech-stack-selection.md) | Core Technology Stack Selection | Accepted |
| [0003](0003-authentication-strategy.md) | Authentication Strategy (Auth.js, SSO-first) | Accepted |
| [0004](0004-hosting-storage-portability.md) | Hosting/Storage Strategy (Vercel+Supabase now, Docker+Azure portable) | Accepted |
| [0005](0005-deferred-domain-restricted-signin.md) | Configurable, Deferred Domain-Restricted Sign-In | Accepted |
| [0006](0006-dual-distribution-strategy.md) | Dual Distribution Strategy — SaaS + Self-Hosted | Accepted |
| [0007](0007-board-card-ordering.md) | Board Card Ordering — Float Fractional Indexing | Superseded by 0009 |
| [0008](0008-board-project-level-composable-filters.md) | Board is a Project-Level View with Composable Filters | Accepted |
| [0009](0009-board-card-ordering-lexorank.md) | Board Card Ordering — String Fractional Ranking (LexoRank-style) | Accepted |
| [0010](0010-board-rank-collision-free-keys.md) | Board Rank — Collision-Free Keys for Concurrent Reordering | Accepted |
| [0011](0011-optimistic-concurrency-issue-mutations.md) | Optimistic Concurrency Control for Issue Mutations | Accepted |
| [0012](0012-home-unified-attention-model.md) | Home — Unified Attention Model (not per-module gadgets) | Accepted |
