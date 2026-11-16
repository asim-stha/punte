// login form, sends the team password to the backend
import { useState } from 'react';
import { api } from '../api';

export default function Login({ onDone }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await api('login', 'POST', { password: pw }); setPw(''); onDone(); }
    catch (ex) { setErr(ex.message); }
    setBusy(false);
  }

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <div className="mascot" aria-hidden="true">
          <svg viewBox="0 0 200 150">
            <path className="mc-ant" d="M52 52V16M148 52V16" />
            <circle className="mc-tipdot" cx="52" cy="14" r="6" /><circle className="mc-tipdot" cx="148" cy="14" r="6" />
            <rect className="mc-ear" x="8" y="62" width="30" height="52" rx="15" /><rect className="mc-ear" x="162" y="62" width="30" height="52" rx="15" />
            <rect className="mc-head" x="24" y="26" width="152" height="118" rx="56" />
            <rect className="mc-visor" x="44" y="50" width="112" height="72" rx="34" />
            <g className="mc-eyes"><ellipse cx="76" cy="82" rx="15" ry="16" /><ellipse cx="124" cy="82" rx="15" ry="16" /></g>
            <path className="mc-smile" d="M90 106q10 8 20 0" />
          </svg>
        </div>
        <div className="logo">Punte</div>
        <p className="mu sub">Your AI desktop buddy. Log in to say hello.</p>
        <label htmlFor="pw">Team password</label>
        <input id="pw" type="password" autoComplete="current-password" autoFocus required value={pw} onChange={e => setPw(e.target.value)} />
        <button className="btn pri" disabled={busy}>{busy ? 'Checking...' : 'Log in'}</button>
        <div role="alert" className="err">{err}</div>
      </form>
    </div>
  );
}
