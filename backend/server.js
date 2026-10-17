// backend server for Punte
// what it does:
//  - /api: login, saved faces, memory, ai chat
//  - /healthz: says if the server and the database work
//  - /vendor: serves the face-api library
//  - relays commands from the website to the ESP32 (the robot connects to /esp)
//  - relays the robot's events and mood to the website (touch, someone near, awake or asleep)
//  - /api/speak: the voice container makes the audio, and we stream it to the robot's speaker
//  - the robot's microphone: audio from the robot -> stt container -> text for the website
//  - relays pictures from the ESP32-CAM to the website (the camera connects to /cam)
// login, storage and ai are separate files in lib/ so each one is easy to swap
const express = require('express');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const { WebSocketServer } = require('ws');
const check = require('./lib/validate');

const PORT = +process.env.PORT || 3000;
const ESP_TOKEN = process.env.ESP_TOKEN || '';
const CAM_TOKEN = process.env.CAM_TOKEN || '';          // empty = camera turned off
const SYNC = new Set(['both', 'web', 'robot', 'none']);   // how the website and the robot work together
const BYTES_PER_SECOND = 32000;                         // robot speaker: 16 kHz x 2 bytes
const GAP_MS = 700;                                    // this much quiet from the robot mic ends a sentence
const MIN_SENTENCE = 12800;                            // 0.4 seconds of audio, shorter is only noise
const MAX_SENTENCE = 480000;                           // 15 seconds
const MAX_FRAME = 100 * 1024;                           // biggest picture we accept (bytes)

let auth, storage, ai, tts, stt;
try {
  if (ESP_TOKEN.length < 16) throw new Error('Set ESP_TOKEN (16+ characters) in .env');
  if (CAM_TOKEN && CAM_TOKEN.length < 16) throw new Error('CAM_TOKEN must be 16+ characters (or leave it empty to turn the camera off)');
  auth = require('./lib/auth')(process.env);
  storage = require('./lib/storage')(process.env);
  ai = require('./lib/ai')(process.env);
  tts = require('./lib/tts')(process.env);
  stt = require('./lib/stt')(process.env);
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

app.get('/api/status', (req, res) => res.json({ esp: esps.size > 0, cam: cams.size > 0, model: ai.model, storage: storage.kind, voice: tts.enabled, ears: stt.enabled }));

// the robot speaks: text -> audio (voice container) -> robot, at the speed the speaker plays it
app.post('/api/speak', wrap(async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 400) : '';
  if (!text) return res.status(400).json({ error: 'text needed' });
  if (!tts.enabled) return res.status(503).json({ error: 'voice engine is off' });
  if (!esps.size) return res.status(409).json({ error: 'robot is offline' });
  try {
    const pcm = await tts.synth(text);
    playToRobots(pcm);
    res.json({ ms: Math.round(pcm.length / BYTES_PER_SECOND * 1000) });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}));

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
const camWss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME });
const esps = new Set(), cams = new Set(), browsers = new Set();
const CMD = /^[xtnrpmlhuc]:-?\d{1,4}(\.\d{1,2})?$/;       // commands the esp32 understands

// The robot has a small audio buffer, so the audio is sent at the speed it is played (a little ahead), not all at once.
let playTimer = null, speakingUntil = 0;
function playToRobots(pcm) {
  clearTimeout(playTimer);                             // a new sentence replaces the old one
  speakingUntil = Date.now() + pcm.length / BYTES_PER_SECOND * 1000 + 800;   // the mic would hear the speaker, so it is ignored for now
  const start = Date.now();
  let sent = 0;
  const step = () => {
    const due = Math.floor((Date.now() - start) / 1000 * BYTES_PER_SECOND) + 4096;
    while (sent < pcm.length && sent < due) {
      const end = Math.min(sent + 640, pcm.length);
      for (const e of esps) if (e.readyState === 1) e.send(pcm.subarray(sent, end), { binary: true });
      sent = end;
    }
    if (sent < pcm.length) playTimer = setTimeout(step, 20);
  };
  step();
}

// The robot's microphone: the robot sends audio while someone speaks. A pause ends the sentence, the stt container turns it into text,
// and the text goes to the browsers that chose "listen with the robot".
let heardChunks = [], heardBytes = 0, heardTimer = null, waiting = 0;
const listeners = () => { let n = 0; for (const b of browsers) if (b.listening) n++; return n; };
const tellEars = () => tell(esps, stt.enabled && listeners() > 0 ? 'a:1' : 'a:0');   // the robot streams only when someone listens
function micChunk(buf) {
  if (!stt.enabled || !listeners() || Date.now() < speakingUntil) return;
  heardChunks.push(buf); heardBytes += buf.length;
  clearTimeout(heardTimer);
  if (heardBytes >= MAX_SENTENCE) return endSentence();
  heardTimer = setTimeout(endSentence, GAP_MS);
}
async function endSentence() {
  clearTimeout(heardTimer);
  const pcm = Buffer.concat(heardChunks);
  heardChunks = []; heardBytes = 0;
  if (pcm.length < MIN_SENTENCE || waiting >= 2) return;
  waiting++;
  try {
    const text = await stt.transcribe(pcm);
    if (text) for (const b of browsers) if (b.listening && b.readyState === 1) b.send(JSON.stringify({ heard: text }));
  } catch (e) {
    console.error('listening failed:', e.message);
  } finally { waiting--; }
}

const tell = (set, msg) => { for (const s of set) if (s.readyState === 1) s.send(msg); };
const status = () => JSON.stringify({ esp: esps.size > 0, cam: cams.size > 0 });
const announce = () => tell(browsers, status());
let lastMood = null;                                   // the robot's latest mood, shown to browsers that connect later
// what the robot tells us: "ev:touch" (something happened) or "mood:1:0" (face number and awake/drowsy/asleep)
function fromRobot(text) {
  let m = /^ev:([a-z]{3,10})$/.exec(text);
  if (m) return { ev: m[1] };
  m = /^mood:(\d{1,2}):([0-2])$/.exec(text);
  if (m) return { mood: { expr: +m[1], state: +m[2] } };
  return null;
}
const isJpeg = b => b.length > 4 && b[0] === 0xff && b[1] === 0xd8;
// the camera only sends pictures while at least one browser is watching
const watchers = () => { let n = 0; for (const b of browsers) if (b.watching) n++; return n; };
const tellCam = () => tell(cams, watchers() > 0 ? 'on' : 'off');

server.on('upgrade', async (req, socket, head) => {
  let kind = null;
  try {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/ws' && await auth.user(req)) kind = 'browser';
    else if (u.pathname === '/esp' && same(u.searchParams.get('token') || '', ESP_TOKEN)) kind = 'esp';
    else if (u.pathname === '/cam' && CAM_TOKEN && same(u.searchParams.get('token') || '', CAM_TOKEN)) kind = 'cam';
  } catch (e) { kind = null; }
  if (!kind) { socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'); return socket.destroy(); }
  (kind === 'cam' ? camWss : wss).handleUpgrade(req, socket, head, ws => {
    ws.alive = true; ws.kind = kind;
    ws.on('pong', () => ws.alive = true);
    if (kind === 'cam') {
      for (const old of cams) old.terminate();             // only one camera at a time, the newest wins
      cams.add(ws); announce(); tellCam(); console.log('Camera connected');
      ws.on('message', (data, isBinary) => {
        if (!isBinary || !isJpeg(data)) return;            // only real pictures are passed on
        for (const b of browsers) {
          if (b.watching && b.readyState === 1 && b.bufferedAmount < 256 * 1024) b.send(data, { binary: true });   // slow browser: skip the picture
        }
      });
      ws.on('close', () => { cams.delete(ws); announce(); console.log('Camera disconnected'); });
    } else if (kind === 'esp') {
      esps.add(ws); announce(); tellEars(); console.log('ESP32 connected');
      ws.on('message', (data, isBinary) => {
        if (isBinary) return micChunk(data);
        const j = fromRobot(data.toString());
        if (!j) return;                                // only known messages are passed on
        if (j.mood) lastMood = j;
        tell(browsers, JSON.stringify(j));
      });
      ws.on('close', () => { esps.delete(ws); if (!esps.size) { lastMood = null; heardChunks = []; heardBytes = 0; } announce(); console.log('ESP32 disconnected'); });
    } else {
      browsers.add(ws); ws.watching = false; ws.sync = 'both'; ws.send(status());
      if (lastMood) ws.send(JSON.stringify(lastMood));
      ws.on('message', data => {
        const s = data.toString();
        if (CMD.test(s)) { if (ws.sync === 'both' || ws.sync === 'robot') tell(esps, s); }   // only known commands, and only when the website may control the robot
        else if (s.startsWith('sync:') && SYNC.has(s.slice(5))) ws.sync = s.slice(5);
        else if (s === 'listen:robot' || s === 'listen:off') { ws.listening = s === 'listen:robot'; tellEars(); }
        else if (s === 'view:on' || s === 'view:off') { ws.watching = s === 'view:on'; tellCam(); }
      });
      ws.on('close', () => { browsers.delete(ws); tellCam(); tellEars(); });
    }
    ws.on('error', () => {});
  });
});
setInterval(() => {                                    // remove dead connections
  for (const ws of [...wss.clients, ...camWss.clients]) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; ws.ping(); }
}, 30000).unref();

server.listen(PORT, () => console.log(`Punte cloud on port ${PORT} (login: ${auth.kind}, storage: ${storage.kind}, AI: ${ai.name} ${ai.model})`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => {   // docker stop: close the database connection first
  server.close();
  try { await storage.close?.(); } catch (e) { /* closing anyway */ }
  process.exit(0);
});