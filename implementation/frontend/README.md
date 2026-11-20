# frontend

React website built with Vite. It is the "frontend" container (built, then served by nginx).

- `src/App.jsx` login check, menu and the five views in `src/views/`
- `src/hooks/useBuddy.js` all behaviour: robot link, camera and faces, speech, chat, memory
- `src/lib/commands.js` small helpers for voice commands (tested in `test/`)
- `nginx.conf` how the built site is served

Local development: start the backend, then `npm run dev` and open http://localhost:5173.
Tests: `npm test`.
