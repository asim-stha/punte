# Troubleshooting

Run the commands on the VM inside `punte/docker`.

## A container is not healthy

```
docker compose ps
docker compose logs --tail 50 backend
```

- `Cannot start: Set ESP_TOKEN` or `Set APP_PASSWORD`: the value in `docker/.env` is too short (token 16+, password 8+).
- `table user_data is missing`: the database volume was created without `init.sql`. Run `docker compose exec -T database psql -U punte punte < ../database/init.sql`.
- The database stays unhealthy: check `docker compose logs database`.

## The website does not open

- Check that ports 80 and 443 are open in the Azure firewall (`az vm open-port`).
- `docker compose logs proxy` shows certificate problems. The domain in `docker/.env` must match the address in the browser.
- Open `https://<address>/healthz`. If it answers, the containers are fine and the problem is in the website.

## Login does not work

- The password is `APP_PASSWORD` in `docker/.env`. After changing it, run `docker compose up -d` so the backend restarts.

## The robot does not connect

- `ESP_TOKEN` in `docker/.env` must be exactly the same as in `secrets.h`.
- The ESP32 needs 2.4 GHz WiFi (not 5 GHz).
- `docker compose logs backend` shows a line when the robot connects or is rejected.

## Backups

- `tail backups/backup.log` shows the last nightly runs.
- `sh database/azure-blob.sh list` (with `BACKUP_STORAGE_ACCOUNT` set) shows what is in Azure.
- A failed upload with a 403 means the VM has no permission. Run `infra/azure-setup.sh` again; it fixes the permission.

## Start over (this deletes the data)

```
docker compose down -v
docker compose up -d --build
```
