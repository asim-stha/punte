// Which AI answers a question: Ollama on this computer first, then the server.
// The fetch function is passed in, so these functions can be tested without a real Ollama.

export class AiError extends Error {
  constructor(message, status, network = false) { super(message); this.status = status; this.network = network; }
}

const REST = 60000;            // after this computer did not answer, ask the server first for this long
const DEVICE_WAIT = 60000;     // how long auto mode waits for this computer before using the server
const DEVICE_ONLY_WAIT = 120000;   // "this computer only" waits longer, a big model may be loading

// browser -> Ollama on this same computer
export async function ollamaChat(base, model, messages, waitMs, extra = {}, fetchFn = fetch) {
  const url = base.replace(/\/$/, '') + '/api/chat';
  const call = async body => {
    let r;
    try {
      r = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(waitMs), body: JSON.stringify(body) });
    } catch (e) {
      throw new AiError(e.name === 'TimeoutError' ? 'no answer after ' + Math.round(waitMs / 1000) + ' seconds'
        : 'cannot reach Ollama: ' + e.message + ' (is Ollama running, and does OLLAMA_ORIGINS allow this site?)', 0, true);
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.message) throw new AiError(j.error || 'Ollama HTTP ' + r.status, r.status);
    return j.message.content || '';
  };
  try {
    return await call({ model, stream: false, messages, ...extra });
  } catch (e) {
    if (extra.think === false && /think/i.test(e.message)) {          // this model has no thinking switch: ask again without it
      const { think, ...rest } = extra;
      return call({ model, stream: false, messages, ...rest });
    }
    throw e;
  }
}

// where: 'auto' (this computer, then the server) | 'local' (this computer only) | 'server' (the server only)
// state remembers when this computer did not answer: { downUntil, note }
// Gives back { text, source: 'device' | 'server' }
export async function askAi({ where, base, model, messages, serverChat, state, skipDevice = false, fetchFn = fetch, now = Date.now }) {
  if (where === 'server') return { text: await serverChat(messages), source: 'server' };
  const device = wait => ollamaChat(base, model, messages, wait, { think: false, keep_alive: '30m' }, fetchFn);
  if (where === 'local') return { text: await device(DEVICE_ONLY_WAIT), source: 'device' };

  if (!skipDevice && now() >= state.downUntil) {
    try {
      const text = await device(DEVICE_WAIT);
      state.downUntil = 0; state.note = '';
      return { text, source: 'device' };
    } catch (e) {
      state.downUntil = now() + REST;
      state.note = e.message;
    }
  }
  try {
    return { text: await serverChat(messages), source: 'server' };
  } catch (e) {
    throw new AiError('No AI answered. This computer: ' + (skipDevice ? 'not used on a phone' : state.note || 'skipped for now') + '. Server: ' + e.message);
  }
}
