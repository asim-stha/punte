// The Punte robot on the stage: white body, glowing visor eyes, ears and floating rings.
// App puts the mood on the room (data-f) and this file draws the robot and its speech bubble.
import { useEffect, useRef, useState } from 'react';

const TILT_OFF = { sad: -9, sleepy: -14, happy: 4, angry: 3 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default function PunteRobot({ f = 'n', asleep = false, pan = 0, tilt = 0, talking = false, say = '', fast = false }) {
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
            <i className="arm l" /><i className="arm r" />
            <div className="torso">
              <div className="plate"><div className="eq"><b /><b /><b /><b /><b /></div></div>
            </div>
            <i className="ring r1" /><i className="ring r2" />
          </div>
        </div>
      </div>
    </>
  );
}
