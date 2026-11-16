// tests the ollama provider against a fake Ollama
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const createAi = require('../lib/ai');

function fakeOllama() {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const b = JSON.parse(body || '{}');
      seen.push({ url: req.url, body: b });
      res.setHeader('Content-Type', 'application/json');
      if (b.model === 'missing') { res.statusCode = 404; return res.end(JSON.stringify({ error: 'model not found' })); }
      res.end(JSON.stringify(b.messages.length ? { message: { content: 'hello from fake' } } : { done: true }));
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, seen, url: 'http://127.0.0.1:' + server.address().port })));
}

test('chat sends the model and keeps it in memory', async () => {
  const f = await fakeOllama();
  const ai = createAi({ OLLAMA_URL: f.url, OLLAMA_MODEL: 'llama3.2:3b', OLLAMA_KEEP_ALIVE: '24h' });
  assert.equal(await ai.chat([{ role: 'user', content: 'hi' }]), 'hello from fake');
  assert.equal(f.seen[0].body.model, 'llama3.2:3b');
  assert.equal(f.seen[0].body.keep_alive, '24h');
  assert.equal(f.seen[0].body.stream, false);
  f.server.close();
});

test('keep alive is 30 minutes when nothing is set', async () => {
  const f = await fakeOllama();
  const ai = createAi({ OLLAMA_URL: f.url });
  await ai.chat([{ role: 'user', content: 'hi' }]);
  assert.equal(f.seen[0].body.keep_alive, '30m');
  assert.equal(ai.model, 'llama3.2:3b');
  f.server.close();
});

test('an Ollama error comes back as a readable message', async () => {
  const f = await fakeOllama();
  const ai = createAi({ OLLAMA_URL: f.url, OLLAMA_MODEL: 'missing' });
  await assert.rejects(ai.chat([{ role: 'user', content: 'hi' }]), /model not found/);
  f.server.close();
});

test('warm loads the model with no messages, and says false when Ollama is off', async () => {
  const f = await fakeOllama();
  const ai = createAi({ OLLAMA_URL: f.url });
  assert.equal(await ai.warm(), true);
  assert.deepEqual(f.seen[0].body.messages, []);
  f.server.close();
  const off = createAi({ OLLAMA_URL: 'http://127.0.0.1:1' });
  assert.equal(await off.warm(), false);
  await assert.rejects(off.chat([{ role: 'user', content: 'hi' }]), /Cannot reach Ollama/);
});
