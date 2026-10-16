const test = require('node:test');
const assert = require('node:assert/strict');
const mirror = require('../lib/storage-mirror');

// small fake storage kept in memory, fail = true makes every call throw
const fake = kind => {
  const s = { kind, fail: false, faces: [], mem: { facts: [], chat: [] } };
  const guard = fn => async (...a) => { if (s.fail) throw new Error(kind + ' is down'); return fn(...a); };
  return Object.assign(s, {
    getFaces: guard(async () => s.faces), setFaces: guard(async (u, l) => { s.faces = l; }),
    getMem: guard(async () => s.mem), setMem: guard(async (u, m) => { s.mem = m; }),
    ping: guard(async () => {})
  });
};
const quiet = () => {};

test('writes reach both storages', async () => {
  const a = fake('postgres'), b = fake('supabase');
  const m = mirror(a, b, quiet);
  await m.setFaces('team', [{ n: 'A' }]);
  await new Promise(r => setImmediate(r));
  assert.equal(a.faces.length, 1);
  assert.equal(b.faces.length, 1);
  assert.equal(m.kind, 'postgres+supabase');
});

test('a broken copy does not break saving', async () => {
  const a = fake('postgres'), b = fake('supabase');
  b.fail = true;
  const m = mirror(a, b, quiet);
  await m.setMem('team', { facts: ['x'], chat: [] });
  assert.deepEqual(a.mem.facts, ['x']);
  assert.equal((await m.ping()).mirror, 'down');
});

test('reads fall back to the copy when the main storage is down', async () => {
  const a = fake('postgres'), b = fake('supabase');
  b.faces = [{ n: 'Saved' }];
  a.fail = true;
  const m = mirror(a, b, quiet);
  assert.equal((await m.getFaces('team'))[0].n, 'Saved');
  await assert.rejects(m.ping());                       // health check still reports the main storage as down
});
