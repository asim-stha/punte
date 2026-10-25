// The Punte robot on the stage: white body, glowing visor eyes, ears and floating rings.
// App puts the mood on the room (data-f). The real 3D robot is drawn by lib/punte3d.js;
// the flat CSS robot below is only used when the browser cannot do 3D.
import { useEffect, useRef, useState } from 'react';

const TILT_OFF = { sad: -9, sleepy: -14, happy: 4, angry: 3 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function FlatRobot({ f = 'n', asleep = false, pan = 0, tilt = 0, talking = false, say = '', fast = false }) {
  const box = useRef(null);
  const rig = useRef(null);
  const prev = useRef(f);
  const hide = useRef(null);
  const still = useRef(false);
  const [show, setShow] = useState(false);
  still.current = asleep || talking;

  // the robot is drawn 600px tall and scaled to fit the window
  useEffect(() => {
    const fit = () => {
      const small = innerWidth <= 860;
      const s = Math.min(innerHeight * (small ? 0.46 : 0.62), innerWidth * (small ? 0.9 : 0.86)) / 600;
      if (box.current) box.current.style.setProperty('--s', s.toFixed(3));
    };
    fit();
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, []);

  // blinking, sometimes twice
  useEffect(() => {
    const timers = [];
    const shut = () => {
      const el = box.current;
      if (!el) return;
      el.classList.add('blink');
      timers.push(setTimeout(() => el.classList.remove('blink'), 120));
    };
    let t;
    const loop = () => {
      shut();
      if (Math.random() < 0.25) timers.push(setTimeout(shut, 260));
      t = setTimeout(loop, 2200 + Math.random() * 3800);
    };
    t = setTimeout(loop, 2200 + Math.random() * 3800);
    return () => { clearTimeout(t); timers.forEach(clearTimeout); };
  }, []);

  // the eyes wander a little when nothing is happening
  useEffect(() => {
    const id = setInterval(() => {
      const el = box.current;
      if (!el) return;
      el.style.setProperty('--ex', still.current ? '0px' : Math.round((Math.random() - 0.5) * 12) + 'px');
      el.style.setProperty('--ey', still.current ? '0px' : Math.round((Math.random() - 0.5) * 7) + 'px');
    }, 3200);
    return () => clearInterval(id);
  }, []);

  // head turn
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const face = asleep ? 'sleepy' : f;
    el.style.setProperty('--pan', clamp(pan, -75, 75));
    el.style.setProperty('--tilt', clamp(tilt + (TILT_OFF[face] || 0), -40, 40));
  }, [f, asleep, pan, tilt]);

  // a small reaction when the expression changes
  useEffect(() => {
    const el = rig.current;
    let t;
    if (el && f !== prev.current && f !== 'n') {
      el.classList.remove('rx');
      el.style.setProperty('--rx', 'rx-' + f);
      void el.offsetWidth;                    // restart the animation
      el.classList.add('rx');
      t = setTimeout(() => el.classList.remove('rx'), 1000);
    }
    prev.current = f;
    return () => clearTimeout(t);
  }, [f]);

  // speech bubble: shown while talking and a moment after
  useEffect(() => {
    clearTimeout(hide.current);
    if (talking && say) setShow(true);
    else hide.current = setTimeout(() => setShow(false), 2500);
    return () => clearTimeout(hide.current);
  }, [talking, say]);

  return (
    <>
      <div className="stage" />
      <div className="pausebadge">Website robot paused</div>
      <div className={'robot-box' + (fast ? ' fast' : '')} ref={box}>
        <div className={'bubble' + (show ? ' show' : '')} role="status">{say}</div>
        <div className="rig" ref={rig}>
          <div className="float">
            <i className="halo" />
            <i className="fx" />
            <div className="headg">
              <i className="hl h5" /><i className="hl h4" /><i className="hl h3" /><i className="hl h2" /><i className="hl h1" />
              <i className="ant l" /><i className="ant r" />
              <i className="bump l" /><i className="bump r" />
              <i className="ear l" /><i className="ear r" />
              <div className="shell">
                <div className="visor">
                  <div className="face">
                    <div className="eyes">
                      <b className="eye"><u className="lid" /></b>
                      <b className="eye"><u className="lid" /></b>
                    </div>
                    <i className="mouth" />
                  </div>
                </div>
              </div>
            </div>
            <div className="bodyg">
              <div className="armw"><i className="arm l" /><i className="arm r" /></div>
              <i className="bl b5" /><i className="bl b4" /><i className="bl b3" /><i className="bl b2" /><i className="bl b1" />
              <div className="torso">
                <div className="plate"><div className="eq"><b /><b /><b /><b /><b /></div></div>
              </div>
            </div>
            <i className="ring r1" /><i className="ring r2" />
          </div>
        </div>
      </div>
    </>
  );
}

function Robot3D({ f = 'n', asleep = false, pan = 0, tilt = 0, talking = false, listening = false, say = '', onFail }) {
  const cv = useRef(null);
  const bub = useRef(null);
  const p3 = useRef(null);
  const hide = useRef(null);
  const [show, setShow] = useState(false);
  const live = useRef({});
  live.current = { f, asleep, pan, tilt, talking, listening };

  useEffect(() => {
    let dead = false, ro = null;
    (async () => {
      try {
        const [THREE, lib] = await Promise.all([import('three'), import('../lib/punte3d.js')]);
        if (dead || !cv.current) return;
        p3.current = lib.createPunte(THREE, cv.current, {
          onProject: (x, y) => { const el = bub.current; if (el) { el.style.left = x + 'px'; el.style.top = y + 'px'; } }
        });
        p3.current.setState(live.current);
        if (window.ResizeObserver) { ro = new ResizeObserver(() => p3.current && p3.current.resize()); ro.observe(cv.current); }
      } catch (e) { if (!dead) onFail(); }
    })();
    return () => { dead = true; if (ro) ro.disconnect(); if (p3.current) { p3.current.dispose(); p3.current = null; } };
  }, []);

  useEffect(() => {
    if (p3.current) p3.current.setState({ f, asleep, pan, tilt, talking, listening });
  }, [f, asleep, pan, tilt, talking, listening]);

  useEffect(() => {
    clearTimeout(hide.current);
    if (talking && say) setShow(true);
    else hide.current = setTimeout(() => setShow(false), 2500);
    return () => clearTimeout(hide.current);
  }, [talking, say]);

  return (
    <>
      <div className="stage" />
      <div className="pausebadge">Website robot paused</div>
      <canvas className="rcanvas" ref={cv} aria-label="Punte robot in 3D. Drag to look around it." />
      <div className={'bubble3d' + (show ? ' show' : '')} ref={bub} role="status">{say}</div>
    </>
  );
}

export default function PunteRobot(props) {
  const [flat, setFlat] = useState(() => {
    try { const c = document.createElement('canvas'); return !(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return true; }
  });
  return flat ? <FlatRobot {...props} /> : <Robot3D {...props} onFail={() => setFlat(true)} />;
}
