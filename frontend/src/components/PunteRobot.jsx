// CSS 3D robot – the approved Punte Preview v4 design ported to React
import { useRef, useEffect } from 'react';
import { FACE_CLASS } from '../lib/commands';

const TILT_OFF = { sad: -9, sleepy: -16, happy: 4, angry: 3 };

export default function PunteRobot({ face = 0, moodState = 0, pan = 0, tilt = 0, talking = false }) {
  const ref = useRef(null);
  const prevFace = useRef(face);

  // blinking loop
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let tid;
    const blink = () => {
      el.classList.add('blink');
      setTimeout(() => el.classList.remove('blink'), 120);
      if (Math.random() < 0.25) {
        setTimeout(() => {
          el.classList.add('blink');
          setTimeout(() => el.classList.remove('blink'), 120);
        }, 240);
      }
      tid = setTimeout(blink, 2200 + Math.random() * 3800);
    };
    tid = setTimeout(blink, 2200 + Math.random() * 3800);
    return () => clearTimeout(tid);
  }, []);

  // update CSS vars, data-f, and toggle classes
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const asleep = moodState === 2;
    const raw = FACE_CLASS[face] || '';
    const f = asleep ? 'sleepy' : raw;
    const tOff = TILT_OFF[f] || 0;
    const hz = f === 'think' ? 7 : 0;
    const hr = pan;
    const ht = tilt + tOff;

    el.dataset.f = f || 'n';
    el.style.setProperty('--hr', hr.toFixed(1));
    el.style.setProperty('--ht', ht.toFixed(1));
    el.style.setProperty('--hz', hz);
    el.style.setProperty('--br', (hr * 0.28).toFixed(1));
    el.style.setProperty('--ex', '0px');
    el.style.setProperty('--ey', '0px');
    el.classList.toggle('asleep', asleep);
    el.classList.toggle('music', talking && !asleep);
  }, [face, moodState, pan, tilt, talking]);

  // reaction animation when expression changes
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const f = FACE_CLASS[face] || '';
    if (face !== prevFace.current && f) {
      el.classList.remove('rx');
      el.style.setProperty('--rx', 'rx-' + f);
      void el.offsetWidth;               // reflow to restart animation
      el.classList.add('rx');
      const tid = setTimeout(() => el.classList.remove('rx'), 1000);
      prevFace.current = face;
      return () => clearTimeout(tid);
    }
    prevFace.current = face;
  }, [face]);

  return (
    <div className="robot3d" data-f="n" ref={ref}>
      <div className="r-bubble"></div>
      <div className="r-badge">Website robot paused</div>
      <div className="r-fx"></div>
      <i className="r-bug"></i>
      <div className="r-scene">
        <div className="r-headwrap">
          <i className="r-lay l3"></i><i className="r-lay l2"></i><i className="r-lay l1"></i>
          <i className="r-horn hl"></i><i className="r-horn hr"></i>
          <i className="r-ear el"></i><i className="r-ear er"></i>
          <div className="r-head">
            <div className="r-face">
              <div className="r-brows"><i className="br"></i><i className="br"></i></div>
              <div className="r-eyes">
                <div className="r-eye"><b className="shine"></b><u className="lid"></u></div>
                <div className="r-eye"><b className="shine"></b><u className="lid"></u></div>
              </div>
              <i className="cheek cl"></i><i className="cheek cr"></i>
              <i className="tear"></i>
              <div className="r-mouth"></div>
            </div>
          </div>
        </div>
        <div className="r-neck"></div>
        <div className="r-bodywrap">
          <div className="r-body">
            <i className="r-pir"></i>
            <div className="r-speaker">
              <i className="r-grill"></i><i className="r-grill"></i><i className="r-grill"></i><i className="r-grill"></i>
            </div>
            <i className="r-ring"></i>
            <div className="r-belly"></div>
            <i className="r-dht"></i>
            <i className="r-arm al"></i><i className="r-arm ar"></i>
          </div>
        </div>
        <div className="r-baseline">
          <div className="r-parts"><i></i><i></i><i></i><i></i><i></i><i></i></div>
          <div className="r-base"></div>
          <div className="r-base2"></div>
        </div>
      </div>
    </div>
  );
}
