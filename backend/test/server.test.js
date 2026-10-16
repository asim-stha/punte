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
const PASSWORD = 'test-password-123', TOKEN = 'test-token-1234567890';
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
    env: { ...process.env, PORT, APP_PASSWORD: PASSWORD, ESP_TOKEN: TOKEN, STORAGE: 'file', DATA_DIR: dir, PUBLIC_DIR: dir },
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
