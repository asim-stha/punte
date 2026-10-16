// storage: where faces and memory are saved
// every storage has getFaces, setFaces, getMem, setMem, ping and close
// STORAGE=postgres (docker), file (local runs), supabase (cloud)
// STORAGE_MIRROR=supabase makes a second copy of everything
const KINDS = {
  file: env => require('./storage-file')(env.DATA_DIR || '/data'),
  postgres: env => require('./storage-postgres')(env),
  supabase: env => require('./storage-supabase')(env)
};

module.exports = function createStorage(env) {
  const make = kind => {
    if (!KINDS[kind]) throw new Error('Unknown storage "' + kind + '". Use: ' + Object.keys(KINDS).join(', '));
    return KINDS[kind](env);
  };
  const main = make(env.STORAGE || 'file');
  if (!env.STORAGE_MIRROR) return main;
  if (env.STORAGE_MIRROR === (env.STORAGE || 'file')) throw new Error('STORAGE_MIRROR must be a different storage than STORAGE');
  return require('./storage-mirror')(main, make(env.STORAGE_MIRROR));
};
