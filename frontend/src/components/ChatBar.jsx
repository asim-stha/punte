// bottom of the room: last messages, microphone, text box and send button
import { useState } from 'react';
import MicButton from './MicButton';

export default function ChatBar({ b, S }) {
  const [text, setText] = useState('');
  const submit = e => {
    e.preventDefault();
    const t = text.trim();
    if (t) { setText(''); b.route(t); }
  };
  const talk = b.messages.filter(m => m.cls === 'me' || m.cls === 'bot');
  const shown = talk.slice(-3);

  return (
    <section className="chat">
      <div className="log" aria-live="polite">
        {shown.map((m, i) => <div key={talk.length - shown.length + i} className={'msg ' + (m.cls === 'me' ? 'you' : 'punte')}>{m.text}</div>)}
      </div>
      <form className="bar glass" onSubmit={submit} autoComplete="off">
        <MicButton b={b} S={S} className="mic">
          <svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
        </MicButton>
        <input type="text" placeholder="Say something to Punte" aria-label="Type to talk" value={text} onChange={e => setText(e.target.value)} />
        <button className="send" type="submit">Send</button>
      </form>
    </section>
  );
}
