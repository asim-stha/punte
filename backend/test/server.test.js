// starts the real server (file storage) and tests the api and the robot relay
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const PORT = 3100 + Math.floor(Math.random() * 500);
const BASE = 'http://127.0.0.1:' + PORT;
const PASSWORD = 'test-password-123', TOKEN = 'test-token-1234567890', CAM = 'test-camera-token-123';
let proc, cookie = '';

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'punte-srv-'));
  proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT, APP_PASSWORD: PASSWORD, ESP_TOKEN: TOKEN, CAM_TOKEN: CAM, STORAGE: 'file', DATA_DIR: dir, PUBLIC_DIR: dir },
    stdio: 'ignore'
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await call('/healthz')).ok) return; } catch (e) { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});
test.after(() => proc && proc.kill());

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
