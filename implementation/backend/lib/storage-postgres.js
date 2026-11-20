// postgres storage: the main database when we use docker
// it connects to the database container, settings come from PGHOST, PGUSER, PGPASSWORD, PGDATABASE
// (or one DATABASE_URL). the table comes from database/init.sql
const { Pool } = require('pg');

module.exports = function postgresStorage(env) {
  const pool = new Pool({
    ...(env.DATABASE_URL ? { connectionString: env.DATABASE_URL } : {}),
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000
  });
  pool.on('error', e => console.error('Postgres connection problem: ' + e.message));

  async function read(user, col) {
    const r = await pool.query(`select ${col} from user_data where owner_id = $1`, [String(user)]);
    return r.rows[0] ? r.rows[0][col] : null;
  }
  // one row per user so a save is all or nothing
  async function write(user, col, value) {
    await pool.query(
      `insert into user_data (owner_id, ${col}) values ($1, $2::jsonb)
       on conflict (owner_id) do update set ${col} = excluded.${col}, updated_at = now()`,
      [String(user), JSON.stringify(value)]
    );
  }

  return {
    kind: 'postgres',
    async getFaces(u) { return (await read(u, 'faces')) || []; },
    async setFaces(u, list) { await write(u, 'faces', list); },
    async getMem(u) { return (await read(u, 'mem')) || { facts: [], chat: [] }; },
    async setMem(u, mem) { await write(u, 'mem', mem); },
    // used by /healthz, fails if the database is down or the table is missing
    async ping() {
      try { await pool.query('select 1 from user_data limit 1'); }
      catch (e) { throw new Error(e.code === '42P01' ? 'table user_data is missing (run database/init.sql)' : e.message); }
    },
    async close() { await pool.end(); }
  };
};
