// asks the stt container to turn what the robot's microphone heard into text
// the audio is 16 kHz, 16-bit, mono (raw samples)
module.exports = env => {
  const base = (env.STT_URL || '').replace(/\/$/, '');
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
    async transcribe(pcm) {
      let r;
      try {
        r = await fetch(base + '/listen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: pcm,
          signal: AbortSignal.timeout(30000)
        });
      } catch (e) { throw new Error('the listening container is not answering'); }
      if (!r.ok) throw new Error('listening engine error ' + r.status);
      const j = await r.json();
      return String(j.text || '').trim().slice(0, 300);
    }
  };
};
