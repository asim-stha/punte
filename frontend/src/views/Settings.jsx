// settings page: connection, voice, privacy and memory (saved in the browser)
import { useEffect, useState } from 'react';
import Toggle from '../components/Toggle';
import ModePicker from '../components/ModePicker';

function useVoices() {
  const [voices, setVoices] = useState([]);
  useEffect(() => {
    const load = () => setVoices(speechSynthesis.getVoices());
    load(); speechSynthesis.onvoiceschanged = load;
    return () => { speechSynthesis.onvoiceschanged = null; };
  }, []);
  return voices;
}

// A list of the models Ollama has, with a way to type any other name.
function ModelPick({ id, label, value, options, onChange }) {
  const [other, setOther] = useState(false);
  const list = [...new Set([value, ...options])].filter(Boolean);
  return <>
    <label htmlFor={id}>{label}</label>
    <select id={id} value={other ? '__other' : value} onChange={e => {
      if (e.target.value === '__other') setOther(true); else { setOther(false); onChange(e.target.value); }
    }}>
      {list.map(m => <option key={m} value={m}>{m}</option>)}
      <option value="__other">Other (type a name)...</option>
    </select>
    {other && <input type="text" aria-label={label + ' name'} value={value} onChange={e => onChange(e.target.value.trim())} />}
  </>;
}

export default function Settings({ b, S, set, onLogout, hidden }) {
  const voices = useVoices();
  const local = S.aiSource === 'local';
  const cloudList = [...new Set(['gemma4:31b-cloud', ...b.models.filter(m => /cloud/i.test(m))])];
  const localList = [...new Set(['llama3.1:8b', 'qwen3.5:4b', 'llama3.2:3b', ...b.models.filter(m => !/cloud/i.test(m))])];
  return (
    <section className="view g2" hidden={hidden}>
      <div className="card">
        <h2>Connection</h2>
        <div className="line"><span className="mu">Server</span><b>{location.host}</b></div>
        <div className="line"><span className="mu">Robot</span><b>{b.robot === null ? 'Checking...' : b.robot ? 'Online' : 'Offline'}</b></div>
        <label htmlFor="ai">Who answers questions</label>
        <select id="ai" value={S.aiSource} onChange={e => set({ aiSource: e.target.value })}>
          <option value="server">The server (Ollama on the server)</option>
          <option value="local">This computer (Ollama on this computer)</option>
        </select>
        {local ? <>
          <label htmlFor="ol">Ollama endpoint</label>
          <input type="text" id="ol" value={S.ol} onChange={e => set({ ol: e.target.value.trim() })} />
          <div className="mu" style={{ margin: '14px 0 8px' }}>Which AI answers</div>
          <ModePicker S={S} set={set} b={b} />
          <ModelPick id="cm" label="Cloud model" value={S.cloudModel} options={cloudList} onChange={v => set({ cloudModel: v })} />
          <ModelPick id="lm" label="Local model (backup)" value={S.localModel} options={localList} onChange={v => set({ localModel: v })} />
          <div className="row" style={{ marginTop: 12 }}><button className="btn" onClick={b.refreshModels}>Refresh model list</button></div>
          {b.modelNote && <p className="mu" style={{ fontSize: 13 }}>{b.modelNote}</p>}
          <p className="mu" style={{ fontSize: 13 }}>Ollama must allow this website: set OLLAMA_ORIGINS to this site's address, then restart Ollama.</p>
        </> : <div className="line"><span className="mu">AI model</span><b>{b.info.model || '-'}</b></div>}
      </div>

      <div className="card">
        <h2>Voice</h2>
        <label htmlFor="mode">Voice mode</label>
        <select id="mode" value={S.mode} onChange={e => set({ mode: e.target.value })}>
          <option value="wake">Wake name (say the name first)</option>
          <option value="push">Push-to-talk (hold the button or Space)</option>
          <option value="always">Always listen (no name needed)</option>
        </select>
        {S.mode === 'wake' && <>
          <label htmlFor="wake">Wake name (separate several with commas)</label>
          <input type="text" id="wake" value={S.wake} onChange={e => set({ wake: e.target.value })} />
        </>}
        <label htmlFor="vc">Voice</label>
        <select id="vc" value={S.voice} onChange={e => set({ voice: e.target.value })}>
          <option value="">Default</option>
          {voices.map(v => <option key={v.name}>{v.name}</option>)}
        </select>
        <label htmlFor="rt">Speaking speed</label>
        <input type="range" id="rt" min="0.6" max="1.4" step="0.1" value={S.rate} style={{ width: '100%' }} onChange={e => set({ rate: +e.target.value })} />
        <h2 style={{ marginTop: 24 }}>Greetings</h2>
        <div className="line">
          <div>Greet people I know<small>Say hello when a known face appears</small></div>
          <Toggle on={S.greet} onChange={v => set({ greet: v })} label="Greet people" />
        </div>
        <label htmlFor="away">Greet the same person again after (minutes away)</label>
        <input type="text" id="away" inputMode="numeric" value={S.away} onChange={e => set({ away: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
      </div>

      <div className="card">
        <h2>Privacy</h2>
        <div className="line"><div>Camera<small>Face tracking and recognition</small></div>
          <Toggle on={S.cam} onChange={v => { set({ cam: v }); b.setCamera(v); }} label="Camera" /></div>
        <div className="line"><div>Microphone<small>Voice input</small></div>
          <Toggle on={S.mic} onChange={v => set({ mic: v })} label="Microphone" /></div>
        <div className="row" style={{ marginTop: 14 }}><button className="btn" onClick={onLogout}>Log out</button></div>
      </div>

      <div className="card">
        <h2>Memory settings</h2>
        <div className="line"><div>Remember conversations<small>Keep recent chats</small></div>
          <Toggle on={S.remember} onChange={v => set({ remember: v })} label="Remember conversations" /></div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={b.clearChat}>Clear conversations</button>
          <button className="btn" style={{ color: '#F87171' }} onClick={b.clearAllMemory}>Clear all memory</button>
        </div>
      </div>
    </section>
  );
}