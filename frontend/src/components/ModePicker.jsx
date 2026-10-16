const MODES = [['auto', 'Cloud first, local backup'], ['cloud', 'Cloud only'], ['local', 'Local only']];

// Chooses which AI answers. It is shown on the Chat screen and in Settings.
export default function ModePicker({ S, set, b }) {
  if (S.aiSource !== 'local') return null;
  const mode = S.aiMode || 'auto';
  const off = mode === 'auto' ? b.ai.cloudOff : '';

  let note = 'No answer yet.';
  if (b.ai.active === 'cloud') note = 'Last answer: cloud (' + S.cloudModel + ')';
  if (b.ai.active === 'local') note = 'Last answer: local (' + S.localModel + ')';
  if (off === 'session') note = 'The cloud is off for this session. Using ' + S.localModel + '.';
  if (off === 'pause') note = 'The cloud had a problem. It will be tried again in a couple of minutes.';

  return (
    <div style={{ marginBottom: 14 }}>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {MODES.map(([k, t]) => (
          <button key={k} className={'btn' + (mode === k ? ' pri' : '')} aria-pressed={mode === k} onClick={() => set({ aiMode: k })}>{t}</button>
        ))}
        {off && <button className="btn" onClick={b.retryCloud}>Try cloud again</button>}
      </div>
      <div className="mu" style={{ fontSize: 13, marginTop: 8 }}>{note}</div>
    </div>
  );
}
