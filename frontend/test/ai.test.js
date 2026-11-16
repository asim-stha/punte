import test from 'node:test';
import assert from 'node:assert/strict';
import { askAi, ollamaChat, AiError } from '../src/lib/ai.js';

const MSG = [{ role: 'user', content: 'hi' }];
const reply = text => async () => ({ ok: true, status: 200, json: async () => ({ message: { content: text } }) });
const refused = async () => { throw new TypeError('Failed to fetch'); };
const server = text => async () => text;
const serverDown = async () => { throw new Error('Cannot reach Ollama at http://ollama:11434'); };
const base = { base: 'http://localhost:11434', model: 'llama3.1:8b', messages: MSG, state: { downUntil: 0, note: '' } };

test('server only never touches this computer', async () => {
  let calls = 0;
  const out = await askAi({ ...base, where: 'server', serverChat: server('from server'), fetchFn: async () => { calls++; } });
  assert.deepEqual(out, { text: 'from server', source: 'server' });
  assert.equal(calls, 0);
});

test('auto uses this computer when Ollama answers', async () => {
  const out = await askAi({ ...base, where: 'auto', serverChat: server('from server'), fetchFn: reply('from laptop') });
  assert.deepEqual(out, { text: 'from laptop', source: 'device' });
});

test('auto uses the server when this computer has no Ollama, then rests the device for a while', async () => {
  const state = { downUntil: 0, note: '' };
  let t = 1000, calls = 0;
  const fetchFn = async () => { calls++; throw new TypeError('Failed to fetch'); };
  const opt = { ...base, state, where: 'auto', serverChat: server('from server'), fetchFn, now: () => t };
  assert.equal((await askAi(opt)).source, 'server');
  assert.equal(calls, 1);
  assert.match(state.note, /cannot reach Ollama/);
  t += 5000;                                           // still resting: the device is not asked again
  assert.equal((await askAi(opt)).source, 'server');
  assert.equal(calls, 1);
  t += 61000;                                          // rest is over: the device is tried again
  assert.equal((await askAi(opt)).source, 'server');
  assert.equal(calls, 2);
});

test('auto goes back to this computer after Ollama is started', async () => {
  const state = { downUntil: 0, note: '' };
  let t = 1000, up = false;
  const fetchFn = async (...a) => up ? reply('from laptop')(...a) : refused();
  const opt = { ...base, state, where: 'auto', serverChat: server('from server'), fetchFn, now: () => t };
  assert.equal((await askAi(opt)).source, 'server');
  up = true; t += 61000;
  assert.equal((await askAi(opt)).source, 'device');
  assert.equal(state.downUntil, 0);
});

test('a phone goes straight to the server in auto mode', async () => {
  let calls = 0;
  const out = await askAi({ ...base, where: 'auto', skipDevice: true, serverChat: server('from server'), fetchFn: async () => { calls++; } });
  assert.equal(out.source, 'server');
  assert.equal(calls, 0);
});

test('this computer only does not fall back', async () => {
  await assert.rejects(askAi({ ...base, where: 'local', serverChat: server('from server'), fetchFn: refused }), /cannot reach Ollama/);
});

test('when nothing answers the error names both', async () => {
  await assert.rejects(askAi({ ...base, where: 'auto', serverChat: serverDown, fetchFn: refused }),
    e => e instanceof AiError && /This computer: cannot reach Ollama/.test(e.message) && /Server: Cannot reach Ollama at http:\/\/ollama/.test(e.message));
});

test('a model without a thinking switch is asked again without it', async () => {
  const bodies = [];
  const fetchFn = async (url, opts) => {
    const body = JSON.parse(opts.body); bodies.push(body);
    return body.think === false
      ? { ok: false, status: 400, json: async () => ({ error: 'this model does not support thinking' }) }
      : { ok: true, status: 200, json: async () => ({ message: { content: 'ok' } }) };
  };
  assert.equal(await ollamaChat('http://localhost:11434', 'llama3.2:3b', MSG, 1000, { think: false }, fetchFn), 'ok');
  assert.equal(bodies.length, 2);
  assert.equal('think' in bodies[1], false);
});
