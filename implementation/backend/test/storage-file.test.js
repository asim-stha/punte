const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('file storage saves and reads faces and memory', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'punte-'));
  const s = require('../lib/storage')({ STORAGE: 'file', DATA_DIR: dir });
  assert.deepEqual(await s.getFaces('team'), []);
  assert.deepEqual(await s.getMem('team'), { facts: [], chat: [] });
  await s.setFaces('team', [{ n: 'Rojan', d: [1] }]);
  await s.setMem('team', { facts: ['a'], chat: [] });
  assert.equal((await s.getFaces('team'))[0].n, 'Rojan');
  assert.deepEqual((await s.getMem('team')).facts, ['a']);
  await s.ping();
});

test('unknown storage name gives a clear error', () => {
  assert.throws(() => require('../lib/storage')({ STORAGE: 'nope' }), /Unknown storage/);
  assert.throws(() => require('../lib/storage')({ STORAGE: 'file', STORAGE_MIRROR: 'file' }), /different/);
});
