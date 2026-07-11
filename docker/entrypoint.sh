#!/bin/sh
# Container startup: apply pending database migrations, then start the app.
# This is what makes the image self-setting-up against an empty Postgres
# (docs/06_Infrastructure/02_Self_Hosted_Client_Lifecycle.md, Step 4).
#
# `prisma migrate deploy` is invoked via its JS entrypoint rather than the
# node_modules/.bin symlink, which does not reliably survive multi-stage
# image COPY.
set -e

if [ -d "./prisma/migrations" ] && [ -n "$(ls -A ./prisma/migrations 2>/dev/null)" ]; then
  echo "Applying database migrations..."
  node ./node_modules/prisma/build/index.js migrate deploy
else
  # No migrations committed yet (pre-first-migration repo state) — skip
  # rather than fail, so the container still starts in that window.
  echo "No migrations found in ./prisma/migrations — skipping migrate deploy."
fi

exec node server.js
