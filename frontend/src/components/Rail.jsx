// right side of the room: camera, mood, head, sync and music
import { useEffect, useRef, useState } from 'react';
import { NAMES, SYNC_OPTIONS } from '../lib/commands';

const KEYS = ['n', 'happy', 'sad', 'angry', 'sleepy', 'wow', 'love', 'think'];   // same order as NAMES
const EMOJI = ['\u{1F610}', '\u{1F604}', '\u{1F622}', '\u{1F620}', '\u{1F634}', '\u{1F62E}', '\u{1F60D}', '\u{1F914}'];   // same order as NAMES
const SYNC_SHORT = { both: 'Both', web: 'Web', robot: 'Robot', none: 'None' };
const SYNC_HINT = {
  both: 'Website and robot move together',
  web: 'Only the website robot reacts',
  robot: 'Only the real robot reacts',
  none: 'Nothing moves'
};
const PAN = 90;      // head turn range on the sliders (degrees)
const TILT = 18;     // head up and down range (degrees)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// a card that folds up; the title is the button
function Card({ title, open = true, children }) {
  const [on, setOn] = useState(open);
  return (
    <section className={'card glass' + (on ? '' : ' shut')}>
      <h3><button type="button" aria-expanded={on} onClick={() => setOn(!on)}>{title}</button></h3>
      <div className="fold" hidden={false} aria-hidden={!on}>{children}</div>
    </section>
  );
}

export default function Rail({ b, S, set, open, setFast }) {
  const [song, setSong] = useState('0');
  const [hp, setHp] = useState({ pan: 0, tilt: 0 });
  const padRef = useRef(null);
  const last = useRef({ t: 0, timer: 0, touched: 0 });
  const steps = useRef([]);

  // when the head moves by itself (following a face), the sliders follow it
  useEffect(() => {
    if (Date.now() - last.current.touched < 700) return;      // you are moving it now, so do not jump back
    setHp({ pan: b.head.pan, tilt: b.head.tilt });
  }, [b.head.pan, b.head.tilt]);
  useEffect(() => () => { clearTimeout(last.current.timer); steps.current.forEach(clearTimeout); }, []);

  // move the head. axes: 'p' = turn, 'h' = up and down. Messages are spaced out so the robot is not flooded.
  function aim(pan, tilt, axes, now) {
    pan = clamp(Math.round(pan), -PAN, PAN);
    tilt = clamp(Math.round(tilt), -TILT, TILT);
    setHp({ pan, tilt });
    const L = last.current;
    L.touched = Date.now();
    const go = () => {
      if (axes.includes('p')) b.send('p:' + pan);
      if (axes.includes('h')) b.send('h:' + tilt);
      L.t = Date.now();
    };
    clearTimeout(L.timer);
    if (now || Date.now() - L.t > 200) go(); else L.timer = setTimeout(go, 200);
  }
  function stop() { steps.current.forEach(clearTimeout); steps.current = []; setFast(false); }
  function play(list, gap, axes) {
    stop();
    setFast(true);
    list.forEach(([p, t], i) => steps.current.push(setTimeout(() => aim(p, t, axes, true), i * gap)));
    steps.current.push(setTimeout(() => setFast(false), list.length * gap));
  }
  const center = () => { stop(); aim(0, 0, 'ph', true); };

  const fromPointer = e => {
    stop();
    const r = padRef.current.getBoundingClientRect();
    const x = clamp((e.clientX - r.left) / r.width, 0, 1);
    const y = clamp((e.clientY - r.top) / r.height, 0, 1);
    aim((x - 0.5) * 2 * PAN, -(y - 0.5) * 2 * TILT, 'ph');
  };
  const padKey = e => {
    const k = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, 2], ArrowDown: [0, -2] }[e.key];
    if (!k) return;
    e.preventDefault();
    stop();
    aim(hp.pan + k[0], hp.tilt + k[1], 'ph');
  };

  const knobX = 50 + clamp(hp.pan, -PAN, PAN) / PAN * 50;
  const knobY = 50 - clamp(hp.tilt, -TILT, TILT) / TILT * 50;

  return (
    <aside className={'rail' + (open ? ' open' : '')} aria-label="Controls">
      <Card title="Camera" open={false}>
        <div className="cam">
          <video ref={b.videoRef} autoPlay muted playsInline hidden={S.faceSource === 'robot'} />
          <div className="vph" hidden={b.cam.on && S.faceSource !== 'robot'}>
            {S.faceSource === 'robot' ? 'Faces are seen by the robot camera' : b.cam.note}
          </div>
        </div>
        <div className="camrow"><span>Seen <b>{b.who}</b></span><button className="btn sm" onClick={b.learnFace}>Learn face</button></div>
      </Card>

      <Card title="Mood" open={true}>
        <div className="orbs">
          {NAMES.map((n, i) => (
            <button key={n} className="orb" aria-pressed={b.face === i} style={{ '--c': 'var(--c-' + KEYS[i] + ')' }} onClick={() => b.send('x:' + i)}>
              <i aria-hidden="true">{EMOJI[i]}</i><span>{n}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card title="Head" open={true}>
        <div className="pad" ref={padRef} tabIndex={0} role="application" aria-label="Head control. Drag, or use the arrow keys."
          onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); fromPointer(e); }}
          onPointerMove={e => { if (e.buttons) fromPointer(e); }}
          onDoubleClick={center} onKeyDown={padKey}>
          <i className="knob" style={{ left: knobX + '%', top: knobY + '%' }} />
        </div>
        <div className="sl">
          <label htmlFor="panr">Pan</label>
          <input type="range" id="panr" min={-PAN} max={PAN} step="1" value={clamp(hp.pan, -PAN, PAN)} onChange={e => { stop(); aim(+e.target.value, hp.tilt, 'p'); }} />
          <output>{hp.pan}</output>
        </div>
        <div className="sl">
          <label htmlFor="tiltr">Tilt</label>
          <input type="range" id="tiltr" min={-TILT} max={TILT} step="1" value={clamp(hp.tilt, -TILT, TILT)} onChange={e => { stop(); aim(hp.pan, +e.target.value, 'h'); }} />
          <output>{hp.tilt}</output>
        </div>
        <div className="moves">
          <button className="btn sm" onClick={center}>Center</button>
          <button className="btn sm" onClick={() => { const p = hp.pan; play([[p, -12], [p, 12], [p, -12], [p, 12], [p, 0]], 300, 'h'); }}>Nod</button>
          <button className="btn sm" onClick={() => { const t = hp.tilt; play([[-30, t], [30, t], [-30, t], [30, t], [0, t]], 280, 'p'); }}>Shake</button>
          <button className="btn sm" onClick={() => play([[-40, 0], [40, 0], [-25, 0], [25, 0], [0, 0]], 750, 'p')}>Look around</button>
          <button className="btn sm" onClick={() => b.send('r:-45')}>Left 45&deg;</button>
          <button className="btn sm" onClick={() => b.send('r:45')}>Right 45&deg;</button>
          <button className="btn sm" onClick={() => b.send('r:360')}>Spin 360&deg;</button>
          <button className="btn sm" onClick={() => b.send('p:180')}>Back</button>
          <button className="btn sm" onClick={() => b.send('c:2')}>Chirp</button>
        </div>
        <label htmlFor="look">Look at</label>
        <select id="look" value={S.lookAt} onChange={e => set({ lookAt: e.target.value })}>
          <option value="face">My face</option>
          <option value="mouse">The mouse</option>
          <option value="off">Nothing (stay still)</option>
        </select>
      </Card>

      <Card title="Sync" open={false}>
        <div className="seg c4">
          {SYNC_OPTIONS.map(([v]) => (
            <button key={v} aria-pressed={S.sync === v} onClick={() => set({ sync: v })}>{SYNC_SHORT[v]}</button>
          ))}
        </div>
        <p className="hint">{SYNC_HINT[S.sync]}</p>
      </Card>

      <Card title="Music" open={false}>
        <select id="song" aria-label="Song" value={song} onChange={e => setSong(e.target.value)}>
          <option value="0">Song 1</option><option value="1">Song 2</option><option value="2">Song 3</option>
        </select>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn pri" style={{ flex: 1 }} onClick={() => b.send('m:' + song)}>Play</button>
          <button className="btn" style={{ flex: 1 }} onClick={() => b.send('m:-1')}>Stop</button>
        </div>
      </Card>
    </aside>
  );
}
