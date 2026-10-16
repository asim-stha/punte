// control page: expressions, head, body and songs
import { useState } from 'react';
import Face from '../components/Face';
import Toggle from '../components/Toggle';
import { NAMES } from '../lib/commands';

export default function Control({ b, S, set, hidden }) {
  const [song, setSong] = useState('0');
  return (
    <section className="view g2" hidden={hidden}>
      <div className="card">
        <h2>Expression</h2>
        <Face n={b.face} mini />
        <div className="gr c4">
          {NAMES.map((n, i) => <button key={n} className={'btn' + (b.face === i ? ' on' : '')} onClick={() => b.send('x:' + i)}>{n}</button>)}
        </div>
      </div>
      <div className="card">
        <h2>Head</h2>
        <div className="gr c3">
          <button className="btn" onClick={() => b.send('r:-45')}>Left 45&deg;</button>
          <button className="btn" onClick={() => b.send('p:0')}>Front</button>
          <button className="btn" onClick={() => b.send('r:45')}>Right 45&deg;</button>
          <button className="btn" onClick={() => b.send('p:180')}>Back</button>
          <button className="btn" onClick={() => b.send('r:360')}>Spin 360&deg;</button>
          <button className="btn" onClick={() => b.send('h:18')}>Look up</button>
          <button className="btn" onClick={() => b.send('h:0')}>Level</button>
          <button className="btn" onClick={() => b.send('h:-18')}>Look down</button>
          <button className="btn" onClick={() => b.send('c:2')}>Chirp</button>
        </div>
        <div className="line" style={{ marginTop: 10 }}>
          <div>Auto-track face<small>Only if the camera is on the robot's head</small></div>
          <Toggle on={S.track} onChange={v => set({ track: v })} label="Auto-track face" />
        </div>
      </div>
      <div className="card">
        <h2>Music</h2>
        <label htmlFor="song">Song</label>
        <select id="song" value={song} onChange={e => setSong(e.target.value)}>
          <option value="0">Song 1</option><option value="1">Song 2</option><option value="2">Song 3</option>
        </select>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn pri" style={{ flex: 1 }} onClick={() => b.send('m:' + song)}>Play</button>
          <button className="btn" style={{ flex: 1 }} onClick={() => b.send('m:-1')}>Stop</button>
        </div>
      </div>
    </section>
  );
}