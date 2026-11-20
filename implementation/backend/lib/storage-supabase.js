// supabase storage: calls the supabase web api directly, no extra package needed
// needs a table called user_data and SUPABASE_URL + SUPABASE_SERVICE_KEY in .env
// the service key is secret: only on the server, never on github
module.exports = function supabaseStorage(env) {
  const url = (env.SUPABASE_URL || '').replace(/\/$/, ''), key = env.SUPABASE_SERVICE_KEY || '';
  if (!url || !key) throw new Error('STORAGE=supabase needs SUPABASE_URL and SUPABASE_SERVICE_KEY in .env');
  const H = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  const TABLE = url + '/rest/v1/user_data';

  async function get(user, col) {
    const r = await fetch(`${TABLE}?owner_id=eq.${encodeURIComponent(user)}&select=${col}`, { headers: H, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('Supabase read failed: HTTP ' + r.status);
    const rows = await r.json();
    return rows[0] ? rows[0][col] : null;
  }
  async function put(user, col, value) {             // one row per user so a write is all or nothing
    const r = await fetch(`${TABLE}?on_conflict=owner_id`, {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ owner_id: String(user), [col]: value, updated_at: new Date().toISOString() })
    });
    if (!r.ok) throw new Error('Supabase write failed: HTTP ' + r.status);
  }
  return {
    kind: 'supabase',
    async getFaces(u) { return (await get(u, 'faces')) || []; },
    async setFaces(u, list) { await put(u, 'faces', list); },
    async getMem(u) { return (await get(u, 'mem')) || { facts: [], chat: [] }; },
    async setMem(u, mem) { await put(u, 'mem', mem); },
    async ping() {
      const r = await fetch(`${TABLE}?select=owner_id&limit=1`, { headers: H, signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error('Supabase check failed: HTTP ' + r.status);
    }
  };
};