#!/bin/sh
# Container start-up: prepare the database, then run the server.
set -e
cd /app/server

# 1) A persistent disk: if DATABASE_URL points at an absolute path that does not exist yet
#    (e.g. a mounted disk at /data), start it from the database bundled in the image.
case "$DATABASE_URL" in
  file:/*)
    DB_PATH="${DATABASE_URL#file:}"
    if [ ! -f "$DB_PATH" ]; then
      mkdir -p "$(dirname "$DB_PATH")"
      cp prisma/dev.db "$DB_PATH"
      echo "[entrypoint] created $DB_PATH from the bundled database"
    fi
    ;;
esac

# 2) Bring the schema up to date. Only additive changes are applied (it refuses anything that
#    would drop data), so existing rows are never lost. If it fails the app still starts:
#    settings fall back to their defaults.
./node_modules/.bin/prisma db push --skip-generate || echo "[entrypoint] WARNING: prisma db push failed, starting anyway"

exec node dist/index.js
