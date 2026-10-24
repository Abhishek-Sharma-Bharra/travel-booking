#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Development container only. For hosted databases use your provider's documented backup process.
mkdir -p .local/backups
file=".local/backups/travelos-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker exec travelos-postgres pg_dump -U travelos -d travelos -Fc > "$file"
test -s "$file"
docker exec -i travelos-postgres pg_restore --list < "$file" >/dev/null
printf 'Backup verified: %s\n' "$file"
