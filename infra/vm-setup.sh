#!/usr/bin/env bash
# vm-setup: first-time setup on the vm (installs docker, gets the code, asks for the passwords, starts the 6 containers)
# run it on the vm: bash vm-setup.sh
set -euo pipefail

REPO=https://github.com/asim-stha/punte.git
DIR="$HOME/punte"
DEFAULT_DOMAIN=punte-cybersquadnp.japaneast.cloudapp.azure.com

# docker (official install script) and git
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi
command -v git >/dev/null 2>&1 || sudo apt-get install -y git

# docker needs sudo until the next login, because the new group is not active yet
if docker info >/dev/null 2>&1; then DOCKER=docker; else DOCKER="sudo docker"; fi

# the code
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone "$REPO" "$DIR"; fi

# the settings file with the real passwords, only created once and never committed
ENV_FILE="$DIR/docker/.env"
if [ ! -f "$ENV_FILE" ]; then
  read -r -p "Domain [$DEFAULT_DOMAIN]: " DOMAIN
  DOMAIN=${DOMAIN:-$DEFAULT_DOMAIN}
  while :; do read -r -s -p "Website password (8+ characters): " APP_PASSWORD; echo; [ ${#APP_PASSWORD} -ge 8 ] && break; done
  while :; do read -r -s -p "ESP token, same as secrets.h (16+ characters): " ESP_TOKEN; echo; [ ${#ESP_TOKEN} -ge 16 ] && break; done
  while :; do read -r -s -p "Camera token, same as the camera secrets.h (16+ characters, empty = no camera): " CAM_TOKEN; echo; [ -z "$CAM_TOKEN" ] || [ ${#CAM_TOKEN} -ge 16 ] && break; done
  POSTGRES_PASSWORD=$(openssl rand -hex 16)
  umask 077
  cat > "$ENV_FILE" <<ENV
DOMAIN=$DOMAIN
APP_PASSWORD=$APP_PASSWORD
ESP_TOKEN=$ESP_TOKEN
CAM_TOKEN=$CAM_TOKEN
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
ENV
fi

# start everything and wait until the containers are healthy
cd "$DIR/docker"
$DOCKER compose up -d --build --wait --wait-timeout 300
$DOCKER compose ps
echo "open https://$(grep '^DOMAIN=' .env | cut -d= -f2)"
