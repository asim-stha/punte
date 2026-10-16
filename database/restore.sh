#!/usr/bin/env sh
# restore: loads a backup made by backup.sh (this replaces the current data)
# run: sh database/restore.sh backups/<file>.sql.gz
set -eu
[ $# -eq 1 ] || { echo "Usage: sh database/restore.sh <backup file>"; exit 1; }
cd "$(dirname "$0")/../docker"
docker compose exec -T database sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB" -c "drop table if exists user_data"'
gunzip -c "../$1" | docker compose exec -T database sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
echo "Restored from $1"
