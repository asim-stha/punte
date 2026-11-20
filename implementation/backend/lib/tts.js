// asks the tts container to turn text into audio for the robot's speaker
// the audio is 16 kHz, 16-bit, mono (raw samples)
module.exports = env => {
  const base = (env.TTS_URL || '').replace(/\/$/, '');
  return {
    enabled: !!base,
    // for the status page: is the container answering
    async health() {
      if (!base) return { ok: false, note: 'Turned off' };
      try {
        const r = await fetch(base + '/health', { signal: AbortSignal.timeout(3000) });
        return r.ok ? { ok: true, note: 'Ready' } : { ok: false, note: 'Still loading' };
      } catch (e) { return { ok: false, note: 'Not answering' }; }
    },
    async synth(text) {
      let r;
      try {
        r = await fetch(base + '/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(20000)
        });
      } catch (e) { throw new Error('the voice container is not answering'); }
      if (!r.ok) throw new Error('voice engine error ' + r.status);
      return Buffer.from(await r.arrayBuffer());
    }
  };
};
