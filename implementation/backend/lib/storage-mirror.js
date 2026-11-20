// mirror: keeps a second copy of the data in another storage (like supabase)
// writes go to the main storage first, then to the copy (if the copy fails we only log it)
// reads come from the main storage, if it is down the copy answers
module.exports = function mirrorStorage(main, copy, log = console.error) {
  const copyFail = what => e => log(`Mirror (${copy.kind}) ${what} failed: ${e.message}`);
  return {
    kind: main.kind + '+' + copy.kind,
    async getFaces(u) {
      try { return await main.getFaces(u); }
      catch (e) { log(`Main storage failed, reading from ${copy.kind}: ${e.message}`); return copy.getFaces(u); }
    },
    async getMem(u) {
      try { return await main.getMem(u); }
      catch (e) { log(`Main storage failed, reading from ${copy.kind}: ${e.message}`); return copy.getMem(u); }
    },
    async setFaces(u, list) { await main.setFaces(u, list); copy.setFaces(u, list).catch(copyFail('write')); },
    async setMem(u, mem) { await main.setMem(u, mem); copy.setMem(u, mem).catch(copyFail('write')); },
    async ping() {
      await main.ping();
      const out = { mirror: 'ok' };
      try { await copy.ping(); } catch (e) { out.mirror = 'down'; }
      return out;
    },
    async close() { await Promise.allSettled([main.close?.(), copy.close?.()]); }
  };
};
