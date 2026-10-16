#!/usr/bin/env bash
# deploy: puts the latest code from github on the vm and restarts only what changed
# run it on the vm: bash infra/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."
if docker info >/dev/null 2>&1; then DOCKER=docker; else DOCKER="sudo docker"; fi

git pull --ff-only
cd docker
$DOCKER compose up -d --build --wait --wait-timeout 300     # no -v here, so the database volume is kept
$DOCKER image prune -f >/dev/null
$DOCKER compose ps

DOMAIN=$(grep '^DOMAIN=' .env | cut -d= -f2)
echo "check: $(curl -fsS "https://$DOMAIN/healthz")"
