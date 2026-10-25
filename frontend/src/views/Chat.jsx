// chat history panel: the whole conversation and quick things to say (typing is in the bar at the bottom)
import { useEffect, useRef } from 'react';
import ModePicker from '../components/ModePicker';

const SUGGESTIONS = ['Say hello', 'Play some music', 'Look left', 'Spin around', 'Play music on YouTube'];

export default function Chat({ b, S, set, hidden }) {
  const logRef = useRef(null);
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [b.messages, hidden]);

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
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {SUGGESTIONS.map(t => <button key={t} className="btn" onClick={() => b.route(t)}>{t}</button>)}
        </div>
      </div>
    </section>
  );
}
