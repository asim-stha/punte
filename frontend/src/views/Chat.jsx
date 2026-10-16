// chat page: type or speak to punte
import { useEffect, useRef, useState } from 'react';
import MicButton from '../components/MicButton';
import ModePicker from '../components/ModePicker';

const SUGGESTIONS = ['Say hello', 'Play some music', 'Look left', 'Spin around', 'Play music on YouTube'];

export default function Chat({ b, S, set, hidden }) {
  const [text, setText] = useState('');
  const logRef = useRef(null);
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [b.messages]);

  const submit = () => { const t = text.trim(); if (t) { setText(''); b.route(t); } };

  return (
    <section className="view" hidden={hidden}>
      <div className="card">
        <h2>Conversation</h2>
        <ModePicker S={S} set={set} b={b} />
        <div id="log" ref={logRef}>
          {b.messages.map((m, i) => (
            <div key={i} className={'m ' + m.cls}>
              {m.text}
              {m.url && <> <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>Open it</a></>}
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          {SUGGESTIONS.map(t => <button key={t} className="btn" onClick={() => b.route(t)}>{t}</button>)}
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <input type="text" placeholder="Type to talk (no wake name needed)" aria-label="Type to talk" value={text}
            onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
          <button className="btn pri" onClick={submit}>Send</button>
          <MicButton b={b} S={S} className="btn mic">&#127908;</MicButton>
        </div>
      </div>
    </section>
  );
}