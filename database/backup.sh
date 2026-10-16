#!/usr/bin/env sh
# backup: saves the database to a .sql.gz file in backups/
# run: sh database/backup.sh
set -eu
cd "$(dirname "$0")/../docker"
mkdir -p ../backups
file="../backups/punte-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose exec -T database sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$file"
echo "Saved $file"
