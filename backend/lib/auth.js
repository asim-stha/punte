// login: who is using the website
// each login type has login(), logout() and user() (user gives the id, or null if not logged in)
// AUTH=password is the only one built: one team password, the user id is always "team"
module.exports = function createAuth(env) {
  const kind = env.AUTH || 'password';
  if (kind === 'password') return passwordAuth(env);
  if (kind === 'supabase') throw new Error('AUTH=supabase is not built yet.');
  throw new Error('Unknown AUTH "' + kind + '". Available now: password');
};

const crypto = require('crypto');
const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const fail = (status, message) => Object.assign(new Error(message), { status });

function passwordAuth(env) {
  const PASSWORD = env.APP_PASSWORD || '';
  if (PASSWORD.length < 8) throw new Error('Set APP_PASSWORD (8+ characters) in .env');
  const SESSION_MS = 7 * 24 * 3600 * 1000;
  const sessions = new Map();                          // cookie id -> expiry time
  const tries = new Map();                             // ip -> times of wrong passwords

  const cookieOf = req => {
    const m = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('sid='));
    return m ? m.slice(4) : '';
  };
  setInterval(() => { const n = Date.now(); for (const [k, v] of sessions) if (v < n) sessions.delete(k); }, 3600e3).unref();

  return {
    kind: 'password',
    async login(req, res) {
      const ip = req.ip, now = Date.now();
      const t = (tries.get(ip) || []).filter(x => now - x < 15 * 60e3);   // max 10 wrong tries in 15 minutes
      tries.set(ip, t);
      if (t.length >= 10) throw fail(429, 'Too many tries. Wait 15 minutes.');
      if (typeof req.body?.password !== 'string' || !same(req.body.password, PASSWORD)) {
        t.push(now); throw fail(401, 'Wrong password');
      }
      const id = crypto.randomBytes(32).toString('hex');
      sessions.set(id, now + SESSION_MS);
      res.append('Set-Cookie', `sid=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${req.secure ? '; Secure' : ''}`);
    },
    async logout(req, res) {
      sessions.delete(cookieOf(req));
      res.append('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
    },
    async user(req) {
      const id = cookieOf(req), exp = sessions.get(id);
      if (!exp) return null;
      if (exp < Date.now()) { sessions.delete(id); return null; }
      return 'team';
    }
  };
}