#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Reuse the development container if present; never remove a database volume automatically.
if docker container inspect travelos-postgres >/dev/null 2>&1; then
  docker start travelos-postgres >/dev/null
else
  docker compose up -d db
fi
for attempt in {1..30}; do
  if docker exec travelos-postgres pg_isready -U travelos -d travelos >/dev/null 2>&1; then
    echo 'Development PostgreSQL is ready.'
    exit 0
  fi
  sleep 1
done
echo 'PostgreSQL did not become ready. Inspect docker logs travelos-postgres.' >&2
exit 1
