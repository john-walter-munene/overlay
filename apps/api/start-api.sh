#!/bin/sh
# API container entrypoint: apply pending DB migrations, optionally (re)seed,
# then start the server. Kept as a script (not an inline dockerCommand) so
# Render doesn't mis-split a quoted command — that produced "exited with status
# 127". Must be LF-only.
set -e
npm run db:deploy

# Staging convenience: set SEED_ON_START=true on the service, redeploy to seed,
# then set it back to false (seeding is idempotent but resets dummy data on each
# boot while enabled). Runs after migrations so tables exist. Not a Render
# preDeployCommand — it's part of startup, which free tier allows.
if [ "$SEED_ON_START" = "true" ]; then
  echo "SEED_ON_START=true -> seeding database"
  # Non-fatal: a seed failure must not stop the API from starting.
  npm run db:seed || echo "WARNING: db:seed failed; starting server anyway"
fi

exec node apps/api/dist/main.js
