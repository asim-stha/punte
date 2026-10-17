// main screen: login check, side menu and the 5 views
import { useEffect, useState } from 'react';
import { api } from './api';
import { useSettings } from './hooks/useSettings';
import { useBuddy } from './hooks/useBuddy';
import Login from './components/Login';
import Home from './views/Home';
import Chat from './views/Chat';
import Control from './views/Control';
import Camera from './views/Camera';
import Memory from './views/Memory';
import Settings from './views/Settings';

const VIEWS = ['home', 'chat', 'camera', 'control', 'memory', 'settings'];
const SUB = { home: 'Punte at a glance', chat: 'Talk or type to Punte', camera: 'What the robot sees', control: 'Expressions, head and music', memory: 'What Punte remembers', settings: 'Connection and preferences' };
const ICO = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  chat: 'M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.6A8 8 0 1 1 21 12z',
  camera: 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  control: 'M4 6h10M18 6h2M4 12h2M10 12h10M4 18h11M19 18h1M16 4v4M8 10v4M17 16v4',
  memory: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1'
};
const read = (k, fallback) => { try { return localStorage.getItem(k) || fallback; } catch (e) { return fallback; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };

export default function App() {
  const [authed, setAuthed] = useState(null);          // null = checking
  const [S, set] = useSettings();
  const [theme, setTheme] = useState(() => read('punteTheme', matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));

  useEffect(() => { document.documentElement.dataset.theme = theme; write('punteTheme', theme); }, [theme]);
  useEffect(() => { api('status').then(() => setAuthed(true)).catch(() => setAuthed(false)); }, []);

  if (authed === null) return null;
  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  return <Dashboard S={S} set={set} theme={theme} setTheme={setTheme} onLoggedOut={() => setAuthed(false)} />;
}

function Dashboard({ S, set, theme, setTheme, onLoggedOut }) {
  const b = useBuddy({ S, onLoggedOut });
  const [view, setView] = useState(() => { const v = read('punteView', 'home'); return VIEWS.includes(v) ? v : 'home'; });
  const go = v => { setView(v); write('punteView', v); window.scrollTo(0, 0); };
  const logout = async () => { try { await fetch('/api/logout', { method: 'POST' }); } catch (e) { /* ignore */ } onLoggedOut(); };

  useEffect(() => { b.setViewing(view === 'camera'); }, [view]);

  const robotClass = b.robot === null ? '' : b.robot ? ' ok' : ' bad';
  const robotText = b.robot === null ? 'Checking robot...' : b.robot ? 'Robot online' : 'Robot offline';

  return (
    <div className="app">
      <aside className="side">
        <a className="logo" href="#" aria-label="Punte, go to Home" onClick={e => { e.preventDefault(); go('home'); }}>
          <span className="lm"><i /><i /></span>Punte
        </a>
        {VIEWS.map(v => (
          <button key={v} className={'nv' + (view === v ? ' on' : '')} data-v={v} onClick={() => go(v)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={ICO[v]} /></svg>
            {v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
        <div className="sp" />
        <div className="mu sfoot" style={{ fontSize: 12, padding: '0 14px 8px' }}>Your AI desktop buddy</div>
        <button className="nv sfoot" aria-label="Switch light or dark theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>Light / Dark</button>
      </aside>

      <div className="main">
        <header className="top">
          <div><h1>{view[0].toUpperCase() + view.slice(1)}</h1><div className="mu" style={{ fontSize: 13 }}>{SUB[view]}</div></div>
          <div className="stat">
            <span className={'pill' + robotClass}><span className="dot" /><span>{robotText}</span></span>
            <span className="pill">Seen: <b>{b.who}</b></span>
            <span className={'pill' + (b.badge === 'Idle' ? '' : ' live')}><span className="dot" /><span>{b.badge}</span></span>
            <span className="addr">{location.host}</span>
            {!b.started && <button className="btn pri" style={{ minHeight: 38 }} onClick={b.connect}>Connect</button>}
          </div>
        </header>

        {/* every screen stays mounted (just hidden), so the camera keeps running while you move around */}
        <Home b={b} S={S} hidden={view !== 'home'} />
        <Chat b={b} S={S} set={set} hidden={view !== 'chat'} />
        <Camera b={b} S={S} set={set} hidden={view !== 'camera'} />
        <Control b={b} S={S} set={set} hidden={view !== 'control'} />
        <Memory b={b} hidden={view !== 'memory'} />
        <Settings b={b} S={S} set={set} onLogout={logout} hidden={view !== 'settings'} />
      </div>
    </div>
  );
}