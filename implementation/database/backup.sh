#!/usr/bin/env sh
# backup: saves the database to a .sql.gz file in backups/ and, on the cloud vm, uploads it to azure
# run: sh database/backup.sh
set -eu
cd "$(dirname "$0")/../docker"
mkdir -p ../backups
file="../backups/punte-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose exec -T database sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "$file"
echo "Saved $file"

# local copies older than 7 days are removed (azure keeps its own for 14 days)
find ../backups -name 'punte-*.sql.gz' -mtime +7 -delete

# upload only when a storage account is set in .env
if [ -z "${BACKUP_STORAGE_ACCOUNT:-}" ] && [ -f .env ]; then
  BACKUP_STORAGE_ACCOUNT=$(grep '^BACKUP_STORAGE_ACCOUNT=' .env | cut -d= -f2 || true)
  BACKUP_CONTAINER=$(grep '^BACKUP_CONTAINER=' .env | cut -d= -f2 || true)
  export BACKUP_STORAGE_ACCOUNT BACKUP_CONTAINER
fi
if [ -n "${BACKUP_STORAGE_ACCOUNT:-}" ]; then
  sh ../database/azure-blob.sh upload "$file"
fi
