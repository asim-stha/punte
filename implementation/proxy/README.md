# proxy

Caddy, the "proxy" container and the only one open to the internet.
`Caddyfile` sends `/api`, `/ws`, `/esp`, `/vendor` and `/healthz` to the backend and everything else to the frontend. Caddy gets and renews the HTTPS certificate by itself, so `DOMAIN` must point to the server and ports 80 and 443 must be open.
