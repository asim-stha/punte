// System status: every container and the robot, checked live. Refreshes by itself while it is on screen.
import { useEffect, useState } from 'react';
import { api } from '../api';

const isPhone = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

export default function SystemStatus({ S }) {
  const [parts, setParts] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const list = (await api('system')).parts;
      if (S.aiWhere !== 'server' && !isPhone) list.splice(7, 0, await thisComputer(S));
      setParts(list); setErr('');
    } catch (e) { setErr('Could not check: ' + e.message); }
    setBusy(false);
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [S.aiWhere, S.ol, S.localModel]);

  const down = parts ? parts.filter(p => !p.ok && !p.optional).length : 0;
  return (
    <div className="card">
      <div className="cardhead">
        <h2>System status</h2>
        <button className="btn sm" onClick={load} disabled={busy}>{busy ? 'Checking...' : 'Check now'}</button>
      </div>
      {parts && <p className={'sysline ' + (down ? 'bad' : 'ok')}>{down ? down + (down === 1 ? ' part needs' : ' parts need') + ' attention' : 'Everything needed is working'}</p>}
      {err && <p className="hint">{err}</p>}
      <ul className="sys">
        {(parts || []).map(p => (
          <li key={p.id} className={p.ok ? 'ok' : p.optional ? 'off' : 'bad'}>
            <i aria-hidden="true" />
            <span><b>{p.name}</b><small>{p.job}</small></span>
            <em>{p.note}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Ollama on this computer is checked from the browser, because the server cannot see it
async function thisComputer(S) {
  const row = { id: 'device', name: 'AI on this computer', job: 'Fast answers on this device', optional: S.aiWhere !== 'local' };
  try {
    const r = await fetch(S.ol.replace(/\/$/, '') + '/api/tags', { signal: AbortSignal.timeout(3000) });
    const names = ((await r.json()).models || []).map(m => m.name);
    if (!names.includes(S.localModel)) return { ...row, ok: false, note: S.localModel + ' is not downloaded' };
    return { ...row, ok: true, note: S.localModel };
  } catch (e) { return { ...row, ok: false, note: 'Ollama is not running' }; }
}
