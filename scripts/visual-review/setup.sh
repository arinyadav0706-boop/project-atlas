#!/usr/bin/env bash
# One-command local stack for the visual review loop (README.md here).
#
# Idempotent: a throwaway Postgres on :5433, migrations, the demo + VERUS seed
# data, and a .env.local pointing at them. Safe to re-run; it skips what exists.
# LOCAL ONLY — it seeds known demo passwords. Never point it at a real database.
set -euo pipefail

cd "$(dirname "$0")/../.."

PG_BIN=/usr/lib/postgresql/16/bin
PG_HOME=/var/lib/postgresql/eagles-dev
DB_URL="postgresql://eagles:eagles@localhost:5433/eagles?schema=public"
# psql rejects the Prisma-only `schema` parameter.
PSQL_URL="postgresql://eagles:eagles@localhost:5433/eagles"

# Postgres refuses to run as root, and the session scratchpad can lose its
# permissions mid-run, so the cluster lives in the postgres user's own home.
if ! pg_isready -h localhost -p 5433 >/dev/null 2>&1; then
  if [ ! -f "$PG_HOME/data/PG_VERSION" ]; then
    mkdir -p "$PG_HOME" && chown postgres:postgres "$PG_HOME"
    su postgres -s /bin/bash -c "$PG_BIN/initdb -D $PG_HOME/data -U postgres --auth=trust >/dev/null"
  fi
  su postgres -s /bin/bash -c "$PG_BIN/pg_ctl -D $PG_HOME/data -o '-p 5433 -k $PG_HOME' -l $PG_HOME/log start" >/dev/null
  for _ in $(seq 1 20); do pg_isready -h localhost -p 5433 >/dev/null 2>&1 && break; sleep 1; done
fi

psql -h localhost -p 5433 -U postgres -tAc "select 1 from pg_roles where rolname='eagles'" | grep -q 1 \
  || psql -h localhost -p 5433 -U postgres -c "create role eagles login password 'eagles' createdb" >/dev/null
psql -h localhost -p 5433 -U postgres -tAc "select 1 from pg_database where datname='eagles'" | grep -q 1 \
  || psql -h localhost -p 5433 -U postgres -c "create database eagles owner eagles" >/dev/null

if [ ! -f .env.local ]; then
  secret() { openssl rand -base64 32; }
  cat > .env.local <<EOF
DATABASE_URL="$DB_URL"
DIRECT_URL="$DB_URL"
NEXTAUTH_URL="http://localhost:3000"
AUTH_URL="http://localhost:3000"
AUTH_TRUST_HOST="true"
NEXTAUTH_SECRET="$(secret)"
AUTH_SECRET="$(secret)"
STORAGE_PROVIDER="local"
ATTACHMENT_MAX_BYTES="4000000"
CREDENTIAL_ENCRYPTION_KEY="$(openssl rand -hex 32)"
EOF
fi

[ -d node_modules ] || npm ci --no-audit --no-fund

set -a; . ./.env.local; set +a
npx prisma migrate deploy >/dev/null

issues=$(psql "$PSQL_URL" -tAc "select count(*) from issues" 2>/dev/null || echo 0)
if [ "${issues:-0}" -lt 100 ]; then
  SEED_DEMO=true SEED_ADMIN_EMAIL=arin@consint.ai SEED_ADMIN_PASSWORD='Passw0rd!' \
    SEED_ADMIN_NAME='Arin Yadav' npx tsx prisma/seed.ts >/dev/null
  SEED_VERUS=confirm npx tsx prisma/verus/seed.ts >/dev/null
fi

# The login rate limiter counts every screenshot run's sign-in; start clean.
psql "$PSQL_URL" -c "delete from rate_limits" >/dev/null

echo "Local stack ready: $(psql "$PSQL_URL" -tAc 'select count(*) from issues') issues."
echo "Start the app with: npx next dev -p 3000"
