// asks the stt container to turn what the robot's microphone heard into text
// the audio is 16 kHz, 16-bit, mono (raw samples)
module.exports = env => {
  const base = (env.STT_URL || '').replace(/\/$/, '');
  return {
    enabled: !!base,
    async transcribe(pcm) {
      const r = await fetch(base + '/listen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: pcm,
        signal: AbortSignal.timeout(30000)
      });
      if (!r.ok) throw new Error('listening engine error ' + r.status);
      const j = await r.json();
      return String(j.text || '').trim().slice(0, 300);
    }
  };
};
