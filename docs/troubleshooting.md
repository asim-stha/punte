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

## Robot voice

- The robot stays silent: in Settings, "Where Punte talks" must be "Robot speaker" or "Robot speaker and this computer", and the robot must be online. The chat log shows "Robot voice did not work" with the reason.
- "voice engine is off": the `tts` container is not running. `docker compose ps` should show it healthy, and `docker compose logs tts` shows "voice ready".
- The first build of `tts` downloads the voice (about 60 MB), so it takes a few minutes.
- The voice sounds choppy: the robot's WiFi is weak. Move it closer to the router or hotspot.
- The voice is too quiet or too loud: use the volume knob on the robot.

## Robot microphone

- In Settings, "Listen with" must be "The robot's microphone", and the robot must be online. Press the microphone button on the Home page. The chat log shows `Ignored: ...` for sentences without the wake name, so you can see it hears you.
- Nothing is heard: `docker compose logs stt` should show "model ready", and `docker compose ps` should show `stt` healthy. The first build downloads the model (about 150 MB).
- It hears you badly: speak within 1 to 2 meters of the robot. Raise `MIC_GAIN` in `desktop_body.ino` (for example 12) and upload again.
- It answers itself: the robot mic hears its own speaker. The server and the robot both mute the mic while it talks. Turn the volume knob down a little if it still happens.
- It is slow: the first sentence after a quiet time takes longer. Put `STT_MODEL=tiny.en` in `docker/.env` and run `bash infra/deploy.sh` again for a faster, less accurate model.

## Camera

- The Camera page says offline: check `CAM_TOKEN` in `docker/.env` is set (16+ characters) and the same as in the camera `secrets.h`. `docker compose logs backend` shows "Camera connected" when it works.
- The Serial Monitor shows "server no": the WiFi is 5 GHz, the cloud address is wrong, or the token is different.
- The camera resets again and again, or shows "Brownout detector": the power is too weak. Use a better USB cable or a 5 V supply that gives 1 A or more.
- "camera failed to start": push the camera ribbon cable in again (lift the black latch first) and check the power.
- The picture is slow: the WiFi is weak. Move the router closer, or raise `FRAME_MS` in the sketch.

## Backups

- `tail backups/backup.log` shows the last nightly runs.
- `sh database/azure-blob.sh list` (with `BACKUP_STORAGE_ACCOUNT` set) shows what is in Azure.
- A failed upload with a 403 means the VM has no permission. Run `infra/azure-setup.sh` again; it fixes the permission.

## Start over (this deletes the data)

```
docker compose down -v
docker compose up -d --build
```
