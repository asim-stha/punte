// needs a running postgres with the table from database/init.sql
// set PGHOST, PGUSER, PGPASSWORD and PGDATABASE to run it, without them the test is skipped
const test = require('node:test');
const assert = require('node:assert/strict');

test('postgres storage saves, updates and reads', { skip: !process.env.PGHOST && 'no PGHOST set' }, async () => {
  const s = require('../lib/storage')({ ...process.env, STORAGE: 'postgres' });
  const user = 'test-' + Date.now();
  try {
    await s.ping();
    assert.deepEqual(await s.getFaces(user), []);
    assert.deepEqual(await s.getMem(user), { facts: [], chat: [] });
    await s.setFaces(user, [{ n: 'Rojan', d: [0.5] }]);
    await s.setMem(user, { facts: ['likes robots'], chat: [] });
    await s.setFaces(user, [{ n: 'Rojan', d: [0.5] }, { n: 'Asim', d: [0.7] }]);   // second save updates the same row
    assert.equal((await s.getFaces(user)).length, 2);
    assert.deepEqual((await s.getMem(user)).facts, ['likes robots']);
  } finally {
    await s.close();
  }
});
