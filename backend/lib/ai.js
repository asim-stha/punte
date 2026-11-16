// ai: sends the chat to a model and gives back the answer
// a provider looks like { name, model, chat(messages), warm() }, AI_PROVIDER=ollama is the only one for now
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
  const post = (body, ms) => fetch(base + '/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(ms), body: JSON.stringify(body)
  });
  return {
    name: 'ollama', model,
    async chat(messages) {
      let r;
      try {
        r = await post({ model, stream: false, keep_alive: keep, messages }, 180000);
      } catch (e) { throw new Error('Cannot reach Ollama at ' + base + ': ' + e.message); }
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.message) throw new Error(j.error || ('Ollama HTTP ' + r.status));
      return String(j.message.content || '');
    },
    // loads the model into memory, so the first question is not slow. It is fine if Ollama is not there (the container is optional)
    async warm() {
      try {
        const r = await post({ model, messages: [], keep_alive: keep }, 120000);
        return r.ok;
      } catch (e) { return false; }
    }
  };
}
