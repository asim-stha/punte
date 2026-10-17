// starts the real server (file storage) and tests the api and the robot relay
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');

const PORT = 3100 + Math.floor(Math.random() * 500);
const BASE = 'http://127.0.0.1:' + PORT;
const PASSWORD = 'test-password-123', TOKEN = 'test-token-1234567890', CAM = 'test-camera-token-123';
const VOICE_BYTES = Buffer.alloc(6400, 7);         // what the fake voice engine answers: 0.2 seconds of audio
let proc, cookie = '', voiceServer, earsServer;
const heardByEars = [];

const face = n => ({ n, d: Array(128).fill(0.2) });
const call = (p, method = 'GET', body, headers = {}) => fetch(BASE + p, {
  method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
  body: body ? JSON.stringify(body) : undefined
});
const authed = () => ({ Cookie: cookie });
const open = (url, headers) => new Promise((resolve, reject) => {
  const ws = new WebSocket(url, { headers });
  ws.once('open', () => resolve(ws));
  ws.once('error', reject);
  ws.once('unexpected-response', (req, res) => reject(new Error('HTTP ' + res.statusCode)));
});
const nextMessage = (ws, ms = 1000) => new Promise(resolve => {
  const t = setTimeout(() => resolve(null), ms);
  ws.once('message', d => { clearTimeout(t); resolve(d.toString()); });
});

test.before(async () => {
  voiceServer = http.createServer((req, res) => {   // stands in for the tts container
    let body = ''; req.on('data', d => body += d);
    req.on('end', () => {
      if (JSON.parse(body).text.includes('fail')) { res.statusCode = 500; return res.end('no'); }
      res.end(VOICE_BYTES);
    });
  });
  await new Promise(r => voiceServer.listen(0, '127.0.0.1', r));
  earsServer = http.createServer((req, res) => {     // stands in for the stt container
    const parts = []; req.on('data', d => parts.push(d));
    req.on('end', () => { heardByEars.push(Buffer.concat(parts).length); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ text: 'hello robot' })); });
  });
  await new Promise(r => earsServer.listen(0, '127.0.0.1', r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'punte-srv-'));
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT, APP_PASSWORD: PASSWORD, ESP_TOKEN: TOKEN, CAM_TOKEN: CAM, TTS_URL: 'http://127.0.0.1:' + voiceServer.address().port, STT_URL: 'http://127.0.0.1:' + earsServer.address().port, STORAGE: 'file', DATA_DIR: dir, PUBLIC_DIR: dir },
    stdio: 'ignore'
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await call('/healthz')).ok) return; } catch (e) { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});
test.after(() => { if (proc) proc.kill(); if (voiceServer) voiceServer.close(); if (earsServer) earsServer.close(); });

test('healthz reports the storage', async () => {
  const r = await call('/healthz');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { status: 'ok', storage: 'file' });
});

test('API needs a login', async () => {
  assert.equal((await call('/api/faces')).status, 401);
  assert.equal((await call('/api/login', 'POST', { password: 'wrong-password' })).status, 401);
});

test('login, then save and read faces and memory', async () => {
  const r = await call('/api/login', 'POST', { password: PASSWORD });
  assert.equal(r.status, 200);
  cookie = r.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/faces', 'PUT', [face('Rojan')], authed())).status, 200);
  assert.equal((await (await call('/api/faces', 'GET', null, authed())).json())[0].n, 'Rojan');
  assert.equal((await call('/api/faces', 'PUT', [{ n: 'Bad', d: [1] }], authed())).status, 400);
  assert.equal((await call('/api/mem', 'PUT', { facts: ['a'], chat: [] }, authed())).status, 200);
  assert.deepEqual((await (await call('/api/mem', 'GET', null, authed())).json()).facts, ['a']);
});

test('robot relay: wrong token refused, known commands pass, unknown commands do not', async () => {
  await assert.rejects(open(`ws://127.0.0.1:${PORT}/esp?token=wrong-token-wrong-token`));
  const esp = await open(`ws://127.0.0.1:${PORT}/esp?token=${TOKEN}`);
  const browser = await open(`ws://127.0.0.1:${PORT}/ws`, authed());
  await nextMessage(browser);                                  // the "esp online" notice
  browser.send('h:18');                                        // head tilt, was blocked before
  assert.equal(await nextMessage(esp), 'h:18');
  browser.send('c:2');                                         // chirp
  assert.equal(await nextMessage(esp), 'c:2');
  browser.send('z:1');                                         // not a known command
  assert.equal(await nextMessage(esp, 300), null);
  esp.close(); browser.close();
});

test('a browser without login cannot open the control socket', async () => {
  await assert.rejects(open(`ws://127.0.0.1:${PORT}/ws`));
});

const frame = n => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(n, 1), Buffer.from([0xff, 0xd9])]);
const nextBinary = (ws, ms = 1000) => new Promise(resolve => {
  const t = setTimeout(() => resolve(null), ms);
  const on = (d, isBinary) => { if (!isBinary) return; clearTimeout(t); ws.off('message', on); resolve(d); };
  ws.on('message', on);
});

test('camera: wrong token refused, pictures only reach browsers that are watching', async () => {
  await assert.rejects(open(`ws://127.0.0.1:${PORT}/cam?token=wrong-token-wrong-token`));
  await assert.rejects(open(`ws://127.0.0.1:${PORT}/cam?token=${TOKEN}`));     // the robot token does not work here
  const browser = await open(`ws://127.0.0.1:${PORT}/ws`, authed());
  const cam = await open(`ws://127.0.0.1:${PORT}/cam?token=${CAM}`);
  assert.equal(await nextMessage(cam), 'off');                 // nobody is watching yet
  const f = frame(500);
  cam.send(f);
  assert.equal(await nextBinary(browser, 300), null);          // not watching, so no picture
  const asked = nextMessage(cam);
  browser.send('view:on');
  assert.equal(await asked, 'on');                             // camera is told to start
  cam.send(f);
  assert.deepEqual(await nextBinary(browser), f);
  browser.close();
  assert.equal(await nextMessage(cam), 'off');                 // last viewer left
  cam.close();
});

test('camera: things that are not pictures are not passed on, big pictures close the connection', async () => {
  const browser = await open(`ws://127.0.0.1:${PORT}/ws`, authed());
  browser.send('view:on');
  const cam = await open(`ws://127.0.0.1:${PORT}/cam?token=${CAM}`);
  await nextMessage(cam);
  cam.send(Buffer.from('not a jpeg at all'));
  cam.send('text message');
  assert.equal(await nextBinary(browser, 300), null);
  const closed = new Promise(r => cam.once('close', r));
  cam.send(frame(200 * 1024));                                 // bigger than the limit
  await closed;
  browser.close();
});

test('status tells the browser when the camera is online', async () => {
  const seen = [];
  const browser = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: authed() });
  browser.on('message', d => seen.push(JSON.parse(d.toString())));       // listen before the first notice arrives
  await new Promise(r => browser.once('open', r));
  const waitFor = async n => { for (let i = 0; i < 30 && seen.length < n; i++) await new Promise(r => setTimeout(r, 50)); };
  await waitFor(1);
  assert.deepEqual(seen[0], { esp: false, cam: false });
  const cam = await open(`ws://127.0.0.1:${PORT}/cam?token=${CAM}`);
  await waitFor(2);
  assert.deepEqual(seen[1], { esp: false, cam: true });
  cam.close();
  await waitFor(3);
  assert.deepEqual(seen[2], { esp: false, cam: false });
  browser.close();
});

// collects every message a socket gets, so none is missed
const collect = ws => { const got = []; ws.on('message', d => got.push(d.toString())); return got; };
const until = async (fn, ms = 1500) => { for (let t = 0; t < ms; t += 25) { if (fn()) return true; await new Promise(r => setTimeout(r, 25)); } return false; };
const connect = (url, headers) => new Promise((resolve, reject) => {
  const ws = new WebSocket(url, { headers }); ws.got = collect(ws);
  ws.once('open', () => resolve(ws)); ws.once('error', reject);
});

test('robot events and mood reach the website, other messages do not', async () => {
  const browser = await connect(`ws://127.0.0.1:${PORT}/ws`, authed());
  const esp = await connect(`ws://127.0.0.1:${PORT}/esp?token=${TOKEN}`);
  esp.send('ev:touch');
  assert.ok(await until(() => browser.got.includes(JSON.stringify({ ev: 'touch' }))));
  esp.send('mood:6:0');
  assert.ok(await until(() => browser.got.includes(JSON.stringify({ mood: { expr: 6, state: 0 } }))));
  const before = browser.got.length;
  esp.send('hello there'); esp.send('mood:99:9'); esp.send('ev:<script>');
  await new Promise(r => setTimeout(r, 200));
  assert.equal(browser.got.length, before);
  const late = await connect(`ws://127.0.0.1:${PORT}/ws`, authed());      // a browser that opens later still learns the mood
  assert.ok(await until(() => late.got.includes(JSON.stringify({ mood: { expr: 6, state: 0 } }))));
  esp.close(); browser.close(); late.close();
});

test('sync: website only and neither stop commands to the robot', async () => {
  const esp = await connect(`ws://127.0.0.1:${PORT}/esp?token=${TOKEN}`);
  const browser = await connect(`ws://127.0.0.1:${PORT}/ws`, authed());
  browser.send('sync:web'); browser.send('h:18');
  await new Promise(r => setTimeout(r, 200));
  assert.ok(!esp.got.includes('h:18'));
  browser.send('sync:none'); browser.send('h:18');
  await new Promise(r => setTimeout(r, 200));
  assert.ok(!esp.got.includes('h:18'));
  browser.send('sync:robot'); browser.send('c:2');
  assert.ok(await until(() => esp.got.includes('c:2')));
  browser.send('sync:nonsense'); browser.send('c:1');              // a wrong value changes nothing
  assert.ok(await until(() => esp.got.includes('c:1')));
  browser.send('sync:both'); browser.send('c:3');
  assert.ok(await until(() => esp.got.includes('c:3')));
  esp.close(); browser.close();
});

test('speak: the voice audio is streamed to the robot speaker', async () => {
  const esp = new WebSocket(`ws://127.0.0.1:${PORT}/esp?token=${TOKEN}`);
  const audio = [];
  esp.on('message', (d, isBinary) => { if (isBinary) audio.push(d); });
  await new Promise(r => esp.once('open', r));
  const r = await call('/api/speak', 'POST', { text: 'Hello there' }, authed());
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ms: 200 });
  assert.ok(await until(() => audio.reduce((n, b) => n + b.length, 0) >= VOICE_BYTES.length));
  const all = Buffer.concat(audio);
  assert.equal(all.length, VOICE_BYTES.length);
  assert.ok(all.equals(VOICE_BYTES));
  assert.ok(audio.every(b => b.length <= 640));                  // small pieces, the robot has a small buffer
  assert.equal((await call('/api/speak', 'POST', { text: 'please fail' }, authed())).status, 502);
  esp.close();
});

test('speak: needs a login, a text and an online robot', async () => {
  assert.equal((await call('/api/speak', 'POST', { text: 'hi' })).status, 401);
  assert.equal((await call('/api/speak', 'POST', { text: '   ' }, authed())).status, 400);
  assert.equal((await call('/api/speak', 'POST', { text: 5 }, authed())).status, 400);
  await new Promise(r => setTimeout(r, 100));
  assert.equal((await call('/api/speak', 'POST', { text: 'hi' }, authed())).status, 409);   // no robot connected
  assert.equal((await (await call('/api/status', 'GET', null, authed())).json()).voice, true);
});

const talkChunks = (esp, bytes) => { for (let i = 0; i < bytes; i += 640) esp.send(Buffer.alloc(Math.min(640, bytes - i), 3)); };

test('robot mic: a sentence becomes text for the browser that listens with the robot', async () => {
  const esp = await connect(`ws://127.0.0.1:${PORT}/esp?token=${TOKEN}`);
  const browser = await connect(`ws://127.0.0.1:${PORT}/ws`, authed());
  assert.ok(await until(() => esp.got.includes('a:0')));               // nobody listens yet, the robot is told to keep quiet
  talkChunks(esp, 16000);
  await new Promise(r => setTimeout(r, 1000));
  assert.equal(heardByEars.length, 0);                                 // so the audio is thrown away
  browser.send('listen:robot');
  assert.ok(await until(() => esp.got.includes('a:1')));
  talkChunks(esp, 16000);
  assert.ok(await until(() => browser.got.includes(JSON.stringify({ heard: 'hello robot' })), 3000));
  assert.deepEqual(heardByEars, [16000]);                              // the whole sentence went to the stt container at once
  talkChunks(esp, 3200);                                               // a very short sound is only noise
  await new Promise(r => setTimeout(r, 1200));
  assert.deepEqual(heardByEars, [16000]);
  browser.send('listen:off');
  assert.ok(await until(() => esp.got.lastIndexOf('a:0') > esp.got.lastIndexOf('a:1')));
  esp.close(); browser.close();
});

test('robot mic: the robot does not hear its own voice', async () => {
  const esp = await connect(`ws://127.0.0.1:${PORT}/esp?token=${TOKEN}`);
  const browser = await connect(`ws://127.0.0.1:${PORT}/ws`, authed());
  browser.send('listen:robot');
  assert.ok(await until(() => esp.got.includes('a:1')));
  const before = heardByEars.length;
  assert.equal((await call('/api/speak', 'POST', { text: 'talking now' }, authed())).status, 200);
  talkChunks(esp, 16000);                                              // arrives while the speaker is playing
  await new Promise(r => setTimeout(r, 1200));
  assert.equal(heardByEars.length, before);
  esp.close(); browser.close();
});
