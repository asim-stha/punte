// tests the request limit with a small express app
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const limit = require('../lib/limit');

test('blocks after the limit and lets requests in again later', async () => {
  const app = express();
  app.get('/x', limit(3, 300), (req, res) => res.json({ ok: true }));
  const server = app.listen(0);
  const url = `http://127.0.0.1:${server.address().port}/x`;
  try {
    for (let i = 0; i < 3; i++) assert.equal((await fetch(url)).status, 200);
    const r = await fetch(url);
    assert.equal(r.status, 429);
    assert.ok(+r.headers.get('retry-after') >= 1);
    assert.match((await r.json()).error, /Too many/);
    await new Promise(ok => setTimeout(ok, 350));
    assert.equal((await fetch(url)).status, 200);
  } finally { server.close(); }
});
