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
        <div className="logo" style={{ paddingBottom: 8 }}><span className="lm"><i /><i /></span>Punte</div>
        <p className="mu" style={{ marginTop: 0 }}>Log in to your AI desktop buddy.</p>
        <label htmlFor="pw">Password</label>
        <input id="pw" type="password" autoComplete="current-password" autoFocus value={pw} onChange={e => setPw(e.target.value)} />
        <button className="btn pri" style={{ marginTop: 16, width: '100%' }} disabled={busy || !pw}>{busy ? 'Checking...' : 'Log in'}</button>
        <div role="alert" style={{ color: 'var(--r)', marginTop: 10, minHeight: 22 }}>{err}</div>
      </form>
    </div>
  );
}