# 04_API

| Doc | Purpose |
|---|---|
| [openapi.yaml](openapi.yaml) | Canonical OpenAPI 3.0 contract for every EAGLES V1 endpoint |

Route Handlers implemented in Phase 4+ must match this contract exactly —
no endpoint may be added to the application that isn't specified here
first (`CLAUDE.md` rule 2). `/api/auth/*` (sign-in/sign-out/callback) is
handled entirely by Auth.js and intentionally not enumerated in the spec.
