#!/usr/bin/env sh
# azure-blob: sends backups to an Azure storage container and gets them back
# the vm logs in with its own azure identity (no keys), then talks to the blob service with curl
# run: sh database/azure-blob.sh upload <file> | list | download <name> [folder]
set -eu

ACCOUNT=${BACKUP_STORAGE_ACCOUNT:-}
CONTAINER=${BACKUP_CONTAINER:-backups}
[ -n "$ACCOUNT" ] || { echo "BACKUP_STORAGE_ACCOUNT is not set"; exit 1; }

# these two can be changed to test the script without azure
BLOB_URL=${BLOB_URL:-https://$ACCOUNT.blob.core.windows.net}
TOKEN_URL=${TOKEN_URL:-http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https%3A%2F%2Fstorage.azure.com%2F}
API=2021-08-06

# short-lived login token from the identity service that only the vm can reach
token() {
  curl -fsS -H "Metadata: true" "$TOKEN_URL" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p'
}

cmd=${1:-}
case "$cmd" in
  upload)
    file=${2:?usage: azure-blob.sh upload <file>}
    curl -fsS -X PUT -H "Authorization: Bearer $(token)" -H "x-ms-version: $API" \
      -H "x-ms-blob-type: BlockBlob" --data-binary @"$file" \
      "$BLOB_URL/$CONTAINER/$(basename "$file")"
    echo "Uploaded $(basename "$file") to $ACCOUNT/$CONTAINER"
    ;;
  list)
    curl -fsS -H "Authorization: Bearer $(token)" -H "x-ms-version: $API" \
      "$BLOB_URL/$CONTAINER?restype=container&comp=list" | grep -o '<Name>[^<]*</Name>' | sed 's/<[^>]*>//g'
    ;;
  download)
    name=${2:?usage: azure-blob.sh download <name> [folder]}
    dest=${3:-.}
    mkdir -p "$dest"
    curl -fsS -H "Authorization: Bearer $(token)" -H "x-ms-version: $API" \
      -o "$dest/$name" "$BLOB_URL/$CONTAINER/$name"
    echo "Saved $dest/$name"
    ;;
  *)
    echo "Usage: sh database/azure-blob.sh upload <file> | list | download <name> [folder]"
    exit 1
    ;;
esac
