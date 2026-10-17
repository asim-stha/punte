// asks the tts container to turn text into audio for the robot's speaker
// the audio is 16 kHz, 16-bit, mono (raw samples)
module.exports = env => {
  const base = (env.TTS_URL || '').replace(/\/$/, '');
  return {
    enabled: !!base,
    async synth(text) {
      const r = await fetch(base + '/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(20000)
      });
      if (!r.ok) throw new Error('voice engine error ' + r.status);
      return Buffer.from(await r.arrayBuffer());
    }
  };
};
