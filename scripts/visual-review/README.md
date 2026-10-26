# Visual review loop — ChatGPT reviews, Claude implements

A design loop for matching Home to the approved reference
(`docs/05_UI/reference/home-reference.webp`, ADR-0057). An OpenAI vision model
acts as the reviewer; Claude Code implements its instructions.

## Rules

- **Presentation only.** Components, styles, tokens, layout, copy, and how many
  items a panel shows (trimmed lists keep a "View all").
- **Forbidden without a human:** database, migrations, API routes, services,
  repositories, DTO/validation types, the API spec, auth. `guard.sh` enforces
  this and stops the loop.
- **Real data only.** No sample values, invented people, meetings, goals or
  trend arrows. Reference elements with no data behind them stay out (module 02
  BR-12, backlog HOME-11/HOME-14).
- **At most 8 rounds**, each committed on its own so any round can be reverted.
- The reviewer's instructions are binding unless they break the rules above or
  make the page worse for users (contrast, text size). A declined instruction
  is written down, with the reason, in that round's notes.

## Run

```bash
scripts/visual-review/setup.sh        # local Postgres :5433, seed data, .env.local
npx next dev -p 3000                  # in the background
BASE=$(git rev-parse HEAD)            # the guard compares against this

NODE_USE_ENV_PROXY=1 node scripts/visual-review/review.mjs 1   # capture + review
#   …implement the instructions, write rounds/round-1-notes.md…
scripts/visual-review/guard.sh "$BASE"    # must pass before committing
NODE_USE_ENV_PROXY=1 node scripts/visual-review/review.mjs 2   # sees round 1 + notes
```

The loop stops when the reviewer returns `"verdict": "approve"`, after round 8,
or when `guard.sh` fails, whichever comes first.

## The API key

Not stored anywhere in the repo. In the cloud environment the network proxy adds
it to requests for `api.openai.com` (a Bearer secret on the environment).
Node's built-in `fetch` only uses the proxy with `NODE_USE_ENV_PROXY=1` (Node ≥ 22.21). Running elsewhere, set `OPENAI_API_KEY`. The model is the first available from
`REVIEW_MODELS` (newest first).
