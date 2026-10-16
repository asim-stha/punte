#!/usr/bin/env bash
# enable-backups: turns on the nightly backup to azure on the vm (run once)
# run on the vm: bash infra/enable-backups.sh <storage account name>
set -euo pipefail

cd "$(dirname "$0")/.."
ACCOUNT=${1:-}
[ -n "$ACCOUNT" ] || read -r -p "Storage account name (printed by azure-setup.sh): " ACCOUNT
[[ "$ACCOUNT" =~ ^[a-z0-9]{3,24}$ ]] || { echo "That is not a valid storage account name"; exit 1; }

# save the account name in the settings file
ENV_FILE=docker/.env
sed -i '/^BACKUP_STORAGE_ACCOUNT=/d;/^BACKUP_CONTAINER=/d' "$ENV_FILE"
printf 'BACKUP_STORAGE_ACCOUNT=%s\nBACKUP_CONTAINER=backups\n' "$ACCOUNT" >> "$ENV_FILE"

# every night at 03:00 Korea time (18:00 UTC), output goes to backups/backup.log
mkdir -p backups
JOB="0 18 * * * cd $PWD && sh database/backup.sh >> backups/backup.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'database/backup.sh' || true; echo "$JOB" ) | crontab -

# one backup now, to check that the upload works
sh database/backup.sh
echo "Backups in azure:"
BACKUP_STORAGE_ACCOUNT=$ACCOUNT sh database/azure-blob.sh list
echo "nightly backup is on"
