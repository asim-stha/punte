// ai: sends the chat to a model and gives back the answer
// a provider looks like { name, model, chat(messages), warm(), health() }, AI_PROVIDER=ollama is the only one for now
// to add another one, make a new file like ollama below and add it here
module.exports = function createAi(env) {
  const p = env.AI_PROVIDER || 'ollama';
  if (p === 'ollama') return ollama(env);
  throw new Error('AI_PROVIDER "' + p + '" is not built yet. Available now: ollama');
};

function ollama(env) {
  const base = (env.OLLAMA_URL || 'http://ollama:11434').replace(/\/$/, '');
  const model = env.OLLAMA_MODEL || 'llama3.2:3b';
  const keep = env.OLLAMA_KEEP_ALIVE || '30m';       // how long the model stays in memory after a question
  const maxTokens = +env.OLLAMA_MAX_TOKENS || 160;   // longest answer (about 120 words), short answers come back faster
  const post = (body, ms) => fetch(base + '/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(ms), body: JSON.stringify(body)
  });
  return {
    name: 'ollama', model,
    async chat(messages) {
      let r;
      try {
        r = await post({ model, stream: false, keep_alive: keep, options: { num_predict: maxTokens }, messages }, 180000);
      } catch (e) {
        if (e.name === 'TimeoutError') throw new Error('The AI on the server took too long to answer.');
        throw new Error('The AI on the server is not running (the ollama container is off).');
      }
      const j = await r.json().catch(() => ({}));
      if (r.status === 404 || /not found/i.test(j.error || '')) throw new Error('The model ' + model + ' is not downloaded on the server yet.');
      if (!r.ok || !j.message) throw new Error(j.error || ('Ollama HTTP ' + r.status));
      return String(j.message.content || '');
    },
    // loads the model into memory, so the first question is not slow. It is fine if Ollama is not there (the container is optional)
    async warm() {
      try {
        const r = await post({ model, messages: [], keep_alive: keep }, 120000);
        return r.ok;
      } catch (e) { return false; }
    },
    // for the status page: is ollama there, and does it have our model
    async health() {
      try {
        const r = await fetch(base + '/api/tags', { signal: AbortSignal.timeout(3000) });
        if (!r.ok) return { ok: false, note: 'Ollama answered with an error' };
        const names = ((await r.json()).models || []).map(m => m.name);
        if (!names.includes(model) && !names.includes(model + ':latest')) return { ok: false, note: 'The model ' + model + ' is not downloaded' };
        return { ok: true, note: model };
      } catch (e) { return { ok: false, note: 'Not running' }; }
    }
  };
}
