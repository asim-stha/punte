// main screen: login check, then Punte's Room (the robot on the stage, controls around it)
import { useEffect, useState } from 'react';
import { api } from './api';
import { useSettings } from './hooks/useSettings';
import { useBuddy } from './hooks/useBuddy';
import { FACE_CLASS, NAMES, showsFace } from './lib/commands';
import Login from './components/Login';
import PunteRobot from './components/PunteRobot';
import Rail from './components/Rail';
import ChatBar from './components/ChatBar';
import Chat from './views/Chat';
import Camera from './views/Camera';
import Memory from './views/Memory';
import Settings from './views/Settings';

// panels that slide out from the left dock
const PANES = [
  ['chat', 'Chat history', 'M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.6A8 8 0 1 1 21 12z'],
  ['camera', 'Robot camera', 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z'],
  ['memory', 'Memory', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2'],
  ['settings', 'Settings', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1']
];
const CONTROLS_ICON = 'M4 7h10M18 7h2M4 17h2M10 17h10M16 5v4M8 15v4';

const modelText = (S, b) => {
  if (S.aiSource !== 'local') return b.info.model || 'Server AI';
  if (S.aiMode === 'cloud') return S.cloudModel;
  if (S.aiMode === 'local') return S.localModel;
  return S.cloudModel + ' (backup: ' + S.localModel + ')';
};

export default function App() {
  const [authed, setAuthed] = useState(null);          // null = checking
  const [S, set] = useSettings();

  useEffect(() => { api('status').then(() => setAuthed(true)).catch(() => setAuthed(false)); }, []);

  if (authed === null) return null;
  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  return <Room S={S} set={set} onLoggedOut={() => setAuthed(false)} />;
}

function Room({ S, set, onLoggedOut }) {
  const b = useBuddy({ S, onLoggedOut });
  const [pane, setPane] = useState(null);              // which side panel is open
  const [rail, setRail] = useState(false);             // controls open (phone only)
  const [fast, setFast] = useState(false);             // quick head moves (nod, shake)
  const logout = async () => { try { await fetch('/api/logout', { method: 'POST' }); } catch (e) { /* ignore */ } onLoggedOut(); };
  const toggle = p => setPane(pane === p ? null : p);

  useEffect(() => { b.setViewing(pane === 'camera'); }, [pane]);
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') setPane(null); };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, []);

  const asleep = !!b.mood && b.mood.state === 2;
  const f = asleep ? 'sleepy' : (FACE_CLASS[b.face] || 'n');
  const talking = b.badge === 'Speaking';
  const listening = b.listening || b.holding;
  const lastSaid = [...b.messages].reverse().find(m => m.cls === 'bot');
  const robotClass = b.robot === null ? '' : b.robot ? ' ok' : ' bad';
  const robotText = b.robot === null ? 'Checking robot...' : b.robot ? 'Robot online' : 'Robot offline';
  const title = (PANES.find(p => p[0] === pane) || [])[1];

  const cls = 'room' + (asleep ? ' asleep' : '') + (listening ? ' listening' : '') + (talking ? ' talking' : '') + (showsFace(S.sync) ? '' : ' paused');

  return (
    <div className={cls} data-f={f}>
      <PunteRobot f={f} asleep={asleep} pan={b.head.pan} tilt={b.head.tilt} talking={talking} say={lastSaid ? lastSaid.text : ''} fast={fast} />

      <header className="top">
        <div className="brand"><span className="lm"><i /><i /></span>Punte</div>
        <div className="pills">
          <span className={'pill' + robotClass}><span className="dot" />{robotText}</span>
          <span className="pill">Seen <b>{b.who}</b></span>
          <span className="pill ai">{modelText(S, b)}</span>
          <span className={'pill' + (b.badge === 'Idle' ? '' : ' live')}><span className="dot" />{b.badge}</span>
          <span className="pill">Mood <b>{asleep ? 'Asleep' : NAMES[b.face] || 'Neutral'}</b></span>
          {!b.started && <button className="btn pri sm" onClick={b.connect}>Connect</button>}
        </div>
      </header>

      <nav className="dock glass" aria-label="Panels">
        {PANES.map(([id, name, path]) => (
          <button key={id} className="dbtn" aria-pressed={pane === id} aria-label={name} onClick={() => toggle(id)}>
            <svg viewBox="0 0 24 24"><path d={path} /></svg><span className="tip">{name}</span>
          </button>
        ))}
        <button className="dbtn ctl-btn" aria-pressed={rail} aria-label="Controls" onClick={() => setRail(!rail)}>
          <svg viewBox="0 0 24 24"><path d={CONTROLS_ICON} /></svg><span className="tip">Controls</span>
        </button>
      </nav>

      <Rail b={b} S={S} set={set} open={rail} setFast={setFast} />
      <ChatBar b={b} S={S} />

      {/* the panels stay mounted (just hidden), so the robot camera picture keeps arriving */}
      <section className={'drawer glass' + (pane ? ' open' : '')} aria-label={title || 'Panel'}>
        <div className="dhead"><h2>{title}</h2><button className="x" aria-label="Close" onClick={() => setPane(null)}>&times;</button></div>
        <Chat b={b} S={S} set={set} hidden={pane !== 'chat'} />
        <Camera b={b} S={S} set={set} hidden={pane !== 'camera'} />
        <Memory b={b} hidden={pane !== 'memory'} />
        <Settings b={b} S={S} set={set} onLogout={logout} hidden={pane !== 'settings'} />
      </section>
    </div>
  );
}
