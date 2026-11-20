# backend

Node.js server (Express and ws). It is the "backend" container.

- `server.js` routes: `/api/*` (login, faces, memory, chat), `/healthz`, `/vendor/*` (face library), WebSockets `/ws` (browser) and `/esp` (robot)
- `lib/auth.js` login (shared team password, cookie session)
- `lib/storage.js` picks the storage: `postgres`, `file` or `supabase`, plus an optional mirror
- `lib/ai.js` asks Ollama for chat answers
- `lib/validate.js` checks data from the browser before it is saved

Run the tests with `npm test`. The Postgres test runs when the `PG*` variables point to a database that has the table from `database/init.sql`.
