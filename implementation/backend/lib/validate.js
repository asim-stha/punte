// checks the data from the browser before we save it
const str = (x, n) => typeof x === 'string' && x.length <= n;

exports.faces = a => Array.isArray(a) && a.length <= 300 && a.every(p =>
  p && str(p.n, 40) && p.n.length > 0 &&
  Array.isArray(p.d) && p.d.length === 128 && p.d.every(x => typeof x === 'number' && isFinite(x)));

exports.mem = m => !!m &&
  Array.isArray(m.facts) && m.facts.length <= 100 && m.facts.every(x => str(x, 2000)) &&
  Array.isArray(m.chat) && m.chat.length <= 40 &&
  m.chat.every(c => c && (c.role === 'user' || c.role === 'assistant') && str(c.content, 2000));

exports.messages = msgs => Array.isArray(msgs) && msgs.length >= 1 && msgs.length <= 40 &&
  msgs.every(m => m && ['system', 'user', 'assistant'].includes(m.role) && str(m.content, 8000));