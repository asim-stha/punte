// backend server for Punte
// what it does:
//  - /api: login, saved faces, memory, ai chat
//  - /healthz: says if the server and the database work
//  - /vendor: serves the face-api library
//  - relays commands from the website to the ESP32 (the robot connects to /esp)
// login, storage and ai are separate files in lib/ so each one is easy to swap
const express = require('express');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const { WebSocketServer } = require('ws');
const check = require('./lib/validate');

const PORT = +process.env.PORT || 3000;
const ESP_TOKEN = process.env.ESP_TOKEN || '';

let auth, storage, ai;
try {
  if (ESP_TOKEN.length < 16) throw new Error('Set ESP_TOKEN (16+ characters) in .env');
  auth = require('./lib/auth')(process.env);
  storage = require('./lib/storage')(process.env);
  ai = require('./lib/ai')(process.env);
} catch (e) {
  console.error('Cannot start: ' + e.message);
  process.exit(1);
}

const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// web app
const app = express();
app.set('trust proxy', 1);                             // we run behind caddy
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(self), microphone=(self)'
  });
  next();
});

// docker and we use this to check the whole chain, gives 503 if the database is down
app.get('/healthz', async (req, res) => {
  try {
    const detail = (await storage.ping()) || {};
    res.json({ status: 'ok', storage: storage.kind, ...detail });
  } catch (e) {
    res.status(503).json({ status: 'down', storage: storage.kind, error: e.message });
  }
});

app.use(express.json({ limit: '1mb' }));

app.post('/api/login', wrap(async (req, res) => { await auth.login(req, res); res.json({ ok: true }); }));
app.post('/api/logout', wrap(async (req, res) => { await auth.logout(req, res); res.json({ ok: true }); }));

// everything below needs a login
app.use('/api', wrap(async (req, res, next) => {
  req.user = await auth.user(req);
  if (!req.user) return res.status(401).json({ error: 'login required' });
  next();
}));

app.get('/api/status', (req, res) => res.json({ esp: esps.size > 0, model: ai.model, storage: storage.kind }));

app.get('/api/faces', wrap(async (req, res) => res.json(await storage.getFaces(req.user))));
app.put('/api/faces', wrap(async (req, res) => {
  if (!check.faces(req.body)) return res.status(400).json({ error: 'bad faces data' });
  await storage.setFaces(req.user, req.body.map(p => ({ n: p.n, d: p.d })));
  res.json({ ok: true });
}));

app.get('/api/mem', wrap(async (req, res) => res.json(await storage.getMem(req.user))));
app.put('/api/mem', wrap(async (req, res) => {
  if (!check.mem(req.body)) return res.status(400).json({ error: 'bad memory data' });
  await storage.setMem(req.user, { facts: req.body.facts, chat: req.body.chat });
  res.json({ ok: true });
}));

app.post('/api/chat', wrap(async (req, res) => {
  if (!check.messages(req.body?.messages)) return res.status(400).json({ error: 'bad messages' });
  try {
    res.json({ message: { content: await ai.chat(req.body.messages) } });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}));

app.use('/vendor/face-api', express.static(path.join(__dirname, 'node_modules/@vladmandic/face-api'), { maxAge: '7d' }));
app.use(express.static(process.env.PUBLIC_DIR || path.join(__dirname, 'public'), { maxAge: 0 }));

app.use((err, req, res, next) => {                     // send errors back as json
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad json' });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'server error' });
});

// websockets
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
const esps = new Set(), browsers = new Set();
const CMD = /^[xtnrpmlhuc]:-?\d{1,4}(\.\d{1,2})?$/;       // commands the esp32 understands

const tell = (set, msg) => { for (const s of set) if (s.readyState === 1) s.send(msg); };
const announce = () => tell(browsers, JSON.stringify({ esp: esps.size > 0 }));

server.on('upgrade', async (req, socket, head) => {
  let kind = null;
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/ws' && await auth.user(req)) kind = 'browser';
    else if (u.pathname === '/esp' && same(u.searchParams.get('token') || '', ESP_TOKEN)) kind = 'esp';
  } catch (e) { kind = null; }
  if (!kind) { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return socket.destroy(); }
  wss.handleUpgrade(req, socket, head, ws => {
    ws.alive = true; ws.kind = kind;
    ws.on('pong', () => ws.alive = true);
    if (kind === 'esp') {
      esps.add(ws); announce(); console.log('ESP32 connected');
      ws.on('close', () => { esps.delete(ws); announce(); console.log('ESP32 disconnected'); });
    } else {
      browsers.add(ws); ws.send(JSON.stringify({ esp: esps.size > 0 }));
      ws.on('message', data => {
        const s = data.toString();
        if (CMD.test(s)) tell(esps, s);                // only pass on known commands
      });
      ws.on('close', () => browsers.delete(ws));
    }
    ws.on('error', () => {});
  });
});
setInterval(() => {                                    // remove dead connections
  for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
}, 30000).unref();

server.listen(PORT, () => console.log(`Punte cloud on port ${PORT} (login: ${auth.kind}, storage: ${storage.kind}, AI: ${ai.name} ${ai.model})`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => {   // docker stop: close the database connection first
  server.close();
  try { await storage.close?.(); } catch (e) { /* closing anyway */ }
  process.exit(0);
});