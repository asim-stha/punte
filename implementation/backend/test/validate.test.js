const test = require('node:test');
const assert = require('node:assert/strict');
const check = require('../lib/validate');

const face = n => ({ n, d: Array(128).fill(0.1) });

test('faces: accepts a good list and rejects bad ones', () => {
  assert.ok(check.faces([face('Rojan')]));
  assert.ok(check.faces([]));
  assert.ok(!check.faces([{ n: '', d: Array(128).fill(0) }]));        // empty name
  assert.ok(!check.faces([{ n: 'A', d: [1, 2, 3] }]));                // wrong length
  assert.ok(!check.faces([{ n: 'A', d: Array(128).fill('x') }]));     // not numbers
  assert.ok(!check.faces('nope'));
});

test('memory: limits size and checks roles', () => {
  assert.ok(check.mem({ facts: ['likes tea'], chat: [{ role: 'user', content: 'hi' }] }));
  assert.ok(!check.mem({ facts: [], chat: [{ role: 'admin', content: 'hi' }] }));
  assert.ok(!check.mem({ facts: Array(101).fill('x'), chat: [] }));
  assert.ok(!check.mem(null));
});

test('messages: needs at least one valid message', () => {
  assert.ok(check.messages([{ role: 'user', content: 'hello' }]));
  assert.ok(!check.messages([]));
  assert.ok(!check.messages([{ role: 'robot', content: 'hello' }]));
});
