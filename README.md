# Punte

![ci](https://github.com/asim-stha/punte/actions/workflows/ci.yml/badge.svg)

Punte is a small desktop buddy robot. An ESP32 body (face on a screen, head tilt, microphone, speaker and sensors) connects to a cloud server on Microsoft Azure. A website controls the robot, talks to it, remembers faces and chats, and asks an AI for answers.

Made by CyberSquadNp, Dongshin University (Cloud Computing project).

## Architecture

```
                 internet (HTTPS)
                        |
                  +-----------+
                  |   proxy   |   Caddy: HTTPS certificate, sends each request to the right container
                  +-----------+
                  /           \
        +-----------+     +-----------+
        | frontend  |     |  backend  |   Node.js: API, login, robot relay, AI proxy
        |  (nginx)  |     +-----------+
        +-----------+           |
        React website           |  private network (no internet, no public port)
                          +-----------+
                          | database  |   PostgreSQL: saved faces and memory
                          +-----------+

ESP32 robot --wss--> proxy --> backend      (the robot connects OUT, so no router setup is needed)
```

| Container | Image | What it does |
|-----------|-------|--------------|
| proxy | caddy | Only part open to the internet (ports 80 and 443). Gets the HTTPS certificate automatically. |
| frontend | nginx (built from `frontend/`) | Serves the React website. |
| backend | node (built from `backend/`) | REST API, login, robot relay, AI proxy, storage. |
| database | postgres | Keeps faces and memory in a volume. Reachable only from the backend. |

An optional fifth container, `ollama`, can run the AI on the server (`--profile server-ai`).

## Folders

- `frontend/` React website (Vite)
- `backend/` Node.js server
- `database/` table script and backup scripts
- `proxy/` Caddy settings
- `docker/` `docker-compose.yml` and `.env.example`
- `firmware/desktop_body/` ESP32 code (Arduino)
- `infra/` Azure setup, VM setup, deploy, backup and alert scripts
- `docs/` deploy guide and troubleshooting
- `.github/workflows/` automatic tests and the uptime check

## Run it on your computer

1. Install Docker Desktop.
2. In the `docker/` folder, copy `.env.example` to `.env` and fill in `APP_PASSWORD`, `ESP_TOKEN` and `POSTGRES_PASSWORD`.
3. In the same folder run: `docker compose up -d --build`
4. Open https://localhost (accept the browser warning for the local certificate) and log in.

Check that all four containers are healthy with `docker compose ps`, and the whole chain with `https://localhost/healthz`.

## Put it on Azure

Step by step in [docs/deploy.md](docs/deploy.md). If something is wrong, see [docs/troubleshooting.md](docs/troubleshooting.md).

## Tests

- Backend: `cd backend && npm install && npm test`
- Frontend: `cd frontend && npm install && npm test`

## Security notes

- Real passwords live only in `docker/.env` and `firmware/desktop_body/secrets.h`. Both are in `.gitignore`.
- Faces are stored as 128 numbers, never as photos.
- The database has no public port. Only the proxy is open to the internet.
