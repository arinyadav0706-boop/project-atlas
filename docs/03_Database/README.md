# Database Design

**Status:** Pending — authored in Phase 2 (Detailed Design).

Will contain: full entity list, normalized schema, ER diagram (Mermaid),
indexing strategy, and the audit/soft-delete convention applied to every
table (`createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `deletedAt`), per
`docs/10_Roadmap/01_Development_Roadmap.md`. The resulting `prisma/schema.prisma`
(Phase 3) must match this document exactly — the document is written first
and is the source of truth for the schema, not the reverse.
