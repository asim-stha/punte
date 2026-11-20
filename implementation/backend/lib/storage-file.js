// file storage: saves json files in one folder, for running locally
const fs = require('fs');
const path = require('path');

module.exports = function fileStorage(dir) {
  fs.mkdirSync(dir, { recursive: true });
  // the team login uses plain names (faces.json, mem.json)
  const name = (kind, user) => user === 'team' ? kind + '.json'
    : kind + '-' + String(user).replace(/[^\w-]/g, '_').slice(0, 64) + '.json';
  const read = (f, fallback) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { return fallback; } };
  const write = (f, obj) => {                        // write to a temp file then rename, so a power cut cannot break the file
    const p = path.join(dir, f), tmp = p + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj));
    fs.renameSync(tmp, p);
  };
  return {
    kind: 'file',
    async getFaces(u) { return read(name('faces', u), []); },
    async setFaces(u, list) { write(name('faces', u), list); },
    async getMem(u) { return read(name('mem', u), { facts: [], chat: [] }); },
    async setMem(u, mem) { write(name('mem', u), mem); },
    async ping() { fs.accessSync(dir, fs.constants.W_OK); }   // the data folder must be writable
  };
};