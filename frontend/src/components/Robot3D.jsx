// A 3D cartoon Punte, built from simple shapes with three.js (no model files to download).
// It copies the robot's face, mood, sleep state and head turn, moves its mouth while talking,
// and waves its arms. Drag it with the mouse or a finger to turn it around.
// If the computer cannot run 3D (old browser, WebGL off), it calls onFail and the flat face is shown instead.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { faceParams, eyeOpenFor, armGesture, approach, panRad, tiltRad, clamp } from '../lib/robot3d';

const BLUE = 0x4cc3ff, DARK = 0x1f1b3a, YELLOW = 0xffd93d, PINK = 0xff8ac0, WHITE = 0xffffff;

export default function Robot3D({ face = 0, moodState, pan = 0, tilt = 0, talking = false, onFail }) {
  const mount = useRef(null);
  const live = useRef({ face, moodState, pan, tilt, talking });
  live.current = { face, moodState, pan, tilt, talking };

  useEffect(() => {
    const host = mount.current;
    if (!host) return;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      if (!renderer.getContext()) throw new Error('no webgl');
    } catch (e) {
      if (onFail) onFail();
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0.1, 9.0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x6b5fb0, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(4, 6, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xbca6ff, 0.5);
    rim.position.set(-5, 2, -4);
    scene.add(rim);

    const mat = (color, extra = {}) => new THREE.MeshToonMaterial({ color, ...extra });
    const made = [];                                  // everything to free on unmount
    const track = o => { made.push(o); return o; };

    // root: the whole robot. Dragging turns this.
    const root = new THREE.Group();
    scene.add(root);
    const bodyMat = mat(BLUE), darkMat = mat(DARK), yellowMat = mat(YELLOW);
    track(bodyMat); track(darkMat); track(yellowMat);

    // feet / base so it sits like a desk buddy
    const baseGeo = track(new THREE.CylinderGeometry(0.95, 1.05, 0.35, 32));
    const base = new THREE.Mesh(baseGeo, bodyMat);
    base.position.y = -1.95;
    root.add(base);

    // body
    const bodyGeo = track(new THREE.CapsuleGeometry(0.85, 0.7, 6, 24));
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = -0.95;
    root.add(body);

    // a small round light on the chest
    const chestGeo = track(new THREE.CircleGeometry(0.22, 24));
    const chest = new THREE.Mesh(chestGeo, mat(YELLOW, { emissive: YELLOW, emissiveIntensity: 0.4 }));
    track(chest.material);
    chest.position.set(0, -0.85, 0.86);
    root.add(chest);

    // neck
    const neckGeo = track(new THREE.CylinderGeometry(0.28, 0.32, 0.3, 20));
    const neck = new THREE.Mesh(neckGeo, bodyMat);
    neck.position.y = -0.3;
    root.add(neck);

    // head group (the robot's own head turn moves this, on top of any dragging)
    const head = new THREE.Group();
    head.position.y = 0.55;
    root.add(head);

    const headGeo = track(new THREE.SphereGeometry(1.0, 36, 28));
    const headMesh = new THREE.Mesh(headGeo, bodyMat);
    headMesh.scale.set(1.12, 1.0, 0.92);
    head.add(headMesh);

    // ears
    const earGeo = track(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 20));
    [-1, 1].forEach(s => {
      const ear = new THREE.Mesh(earGeo, yellowMat);
      ear.rotation.z = Math.PI / 2;
      ear.position.set(s * 1.12, 0, 0);
      head.add(ear);
    });

    // antenna
    const antGeo = track(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 12));
    const ant = new THREE.Mesh(antGeo, darkMat);
    ant.position.y = 1.15;
    head.add(ant);
    const ballGeo = track(new THREE.SphereGeometry(0.12, 20, 16));
    const ball = new THREE.Mesh(ballGeo, mat(YELLOW, { emissive: YELLOW, emissiveIntensity: 0.5 }));
    track(ball.material);
    ball.position.y = 1.42;
    head.add(ball);

    // face screen: a flat panel on the front of the head, showing a canvas we redraw each frame
    const fc = document.createElement('canvas');
    fc.width = 512; fc.height = 320;
    const fx = fc.getContext('2d');
    const faceTex = new THREE.CanvasTexture(fc);
    faceTex.colorSpace = THREE.SRGBColorSpace;
    const screenGeo = track(new THREE.PlaneGeometry(1.5, 0.95));
    const screenMat = new THREE.MeshBasicMaterial({ map: faceTex });
    track(faceTex); track(screenMat);
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 0.02, 0.88);
    head.add(screen);
    // a dark bezel just behind the screen
    const bezelGeo = track(new THREE.PlaneGeometry(1.66, 1.1));
    const bezel = new THREE.Mesh(bezelGeo, darkMat);
    bezel.position.set(0, 0.02, 0.86);
    head.add(bezel);

    // arms: a pivot group at each shoulder so they swing from the shoulder
    function makeArm(side) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.95, -0.6, 0.1);
      const armGeo = track(new THREE.CapsuleGeometry(0.16, 0.6, 6, 16));
      const arm = new THREE.Mesh(armGeo, bodyMat);
      arm.position.y = -0.45;                         // hangs below the shoulder
      pivot.add(arm);
      const handGeo = track(new THREE.SphereGeometry(0.22, 20, 16));
      const hand = new THREE.Mesh(handGeo, yellowMat);
      hand.position.y = -0.85;
      pivot.add(hand);
      root.add(pivot);
      return pivot;
    }
    const armL = makeArm(-1), armR = makeArm(1);

    // ---------- the live animated values (eased toward their targets every frame) ----------
    const v = { eye: 1, curve: 0, brow: 0, mouthOpen: 0.15, look: 0, lookUp: 0, heart: 0, pan: 0, tilt: 0, armL: 0, armR: 0 };
    let blinkT = performance.now() + 1500 + Math.random() * 2500;
    let blink = 1;                                    // 1 open, dips to 0 for a blink

    function drawFace(now) {
      const w = fc.width, h = fc.height;
      fx.fillStyle = '#1f1b3a';
      fx.fillRect(0, 0, w, h);
      // faint dot grid, like the little OLED face
      fx.fillStyle = 'rgba(255,228,94,0.10)';
      for (let y = 16; y < h; y += 26) for (let xx = 16; xx < w; xx += 26) { fx.beginPath(); fx.arc(xx, y, 1.6, 0, 7); fx.fill(); }

      const cx = w / 2, cy = h / 2 - 10;
      const ex = 112, eyeY = cy - 6 + v.lookUp * -26;
      const openH = clamp(v.eye * blink, 0, 1.3) * 62;  // eye height in pixels
      const lookX = v.look * 22;

      fx.fillStyle = '#ffd93d';
      fx.strokeStyle = '#ffd93d';
      fx.lineWidth = 16;
      fx.lineCap = 'round';

      if (v.heart > 0.5) {                            // love: two hearts
        drawHeart(cx - ex + lookX, eyeY, 34);
        drawHeart(cx + ex + lookX, eyeY, 34);
      } else if (openH < 9) {                         // closed / asleep: a calm line
        [-1, 1].forEach(s => { fx.beginPath(); fx.moveTo(cx + s * ex + lookX - 30, eyeY); fx.lineTo(cx + s * ex + lookX + 30, eyeY); fx.stroke(); });
      } else if (v.curve > 0.3) {                     // happy: upward arcs
        [-1, 1].forEach(s => { fx.beginPath(); fx.arc(cx + s * ex + lookX, eyeY + 14, 30, Math.PI * 1.15, Math.PI * 1.85); fx.stroke(); });
      } else {                                        // normal eyes, taller or shorter by openH
        [-1, 1].forEach(s => roundRect(cx + s * ex + lookX - 17, eyeY - openH / 2, 34, openH, 15));
        if (v.curve < -0.3) {                         // sad: little brows angled up at the outer edge
          fx.lineWidth = 9;
          [-1, 1].forEach(s => { fx.beginPath(); fx.moveTo(cx + s * ex - 34, eyeY - openH / 2 - 20); fx.lineTo(cx + s * ex + 20, eyeY - openH / 2 - 6); fx.stroke(); });
        }
      }
      // angry brows: angled down toward the middle
      if (v.brow < -0.3) {
        fx.lineWidth = 11;
        [-1, 1].forEach(s => { fx.beginPath(); fx.moveTo(cx + s * ex - s * 34, eyeY - openH / 2 - 26); fx.lineTo(cx + s * ex + s * 26, eyeY - openH / 2 - 6); fx.stroke(); });
      }

      // mouth
      const my = cy + 72;
      fx.lineWidth = 12;
      const open = v.mouthOpen * (live.current.talking ? 1 : 0.5);
      if (open > 0.45) {                              // open mouth (talking / surprised): a rounded box
        const mh = 10 + open * 48;
        fx.fillStyle = '#ffd93d';
        roundRect(cx - 34, my - mh / 2, 68, mh, 12);
      } else if (v.curve < -0.3) {                    // sad frown
        fx.beginPath(); fx.arc(cx, my + 26, 34, Math.PI * 1.2, Math.PI * 1.8, true); fx.stroke();
      } else if (v.curve > 0.3 || v.brow > 0.1) {     // smile
        fx.beginPath(); fx.arc(cx, my - 10, 38, Math.PI * 0.18, Math.PI * 0.82); fx.stroke();
      } else {                                        // calm line
        fx.beginPath(); fx.moveTo(cx - 28, my); fx.lineTo(cx + 28, my); fx.stroke();
      }
      faceTex.needsUpdate = true;
    }
    function roundRect(x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      fx.beginPath();
      fx.moveTo(x + rr, y);
      fx.arcTo(x + w, y, x + w, y + h, rr);
      fx.arcTo(x + w, y + h, x, y + h, rr);
      fx.arcTo(x, y + h, x, y, rr);
      fx.arcTo(x, y, x + w, y, rr);
      fx.fill();
    }
    function drawHeart(x, y, s) {
      fx.beginPath();
      fx.moveTo(x, y + s * 0.3);
      fx.bezierCurveTo(x, y, x - s, y - s * 0.1, x - s, y - s * 0.5);
      fx.bezierCurveTo(x - s, y - s * 1.1, x, y - s * 1.1, x, y - s * 0.6);
      fx.bezierCurveTo(x, y - s * 1.1, x + s, y - s * 1.1, x + s, y - s * 0.5);
      fx.bezierCurveTo(x + s, y - s * 0.1, x, y, x, y + s * 0.3);
      fx.fill();
    }

    // ---------- drag to turn the robot ----------
    const drag = { on: false, x: 0, y: 0, ry: 0, rx: 0 };
    const dom = renderer.domElement;
    dom.style.touchAction = 'none';
    dom.style.cursor = 'grab';
    const down = e => { drag.on = true; drag.x = e.clientX; drag.y = e.clientY; dom.style.cursor = 'grabbing'; dom.setPointerCapture?.(e.pointerId); };
    const move = e => {
      if (!drag.on) return;
      drag.ry = clamp(drag.ry + (e.clientX - drag.x) * 0.01, -Math.PI, Math.PI);
      drag.rx = clamp(drag.rx + (e.clientY - drag.y) * 0.006, -0.5, 0.5);
      drag.x = e.clientX; drag.y = e.clientY;
    };
    const up = e => { drag.on = false; dom.style.cursor = 'grab'; dom.releasePointerCapture?.(e.pointerId); };
    dom.addEventListener('pointerdown', down);
    dom.addEventListener('pointermove', move);
    addEventListener('pointerup', up);

    // ---------- size ----------
    function resize() {
      const w = host.clientWidth, h = host.clientHeight || Math.round(w * 0.62);
      if (!w) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    host.appendChild(dom);
    resize();

    // ---------- the animation loop ----------
    let raf = 0, running = true;
    const start = performance.now();
    function frame(now) {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      const t = (now - start) / 1000;
      const L = live.current;
      const fp = faceParams(L.face);

      // blink (never while asleep, so the line stays calm)
      if (now > blinkT && eyeOpenFor(L.face, L.moodState) > 0.2) { blink = 0; blinkT = now + 2200 + Math.random() * 3200; }
      blink = approach(blink, 1, 0.22);
      if (blink < 0.06) blink = 0.06;

      // ease the face toward the expression
      v.eye = approach(v.eye, eyeOpenFor(L.face, L.moodState), 0.18);
      v.curve = approach(v.curve, fp.eyeCurve, 0.15);
      v.brow = approach(v.brow, fp.brow, 0.15);
      v.look = approach(v.look, fp.look, 0.12);
      v.lookUp = approach(v.lookUp, fp.lookUp, 0.12);
      v.heart = approach(v.heart, fp.heart ? 1 : 0, 0.2);
      const mouthTarget = L.talking ? 0.5 + 0.5 * Math.abs(Math.sin(t * 11)) : fp.mouthOpen;
      v.mouthOpen = approach(v.mouthOpen, mouthTarget, L.talking ? 0.45 : 0.15);

      // head turn: the robot's own pan/tilt, plus a gentle idle sway
      const sway = Math.sin(t * 0.7) * 0.05;
      v.pan = approach(v.pan, panRad(L.pan), 0.1);
      v.tilt = approach(v.tilt, tiltRad(L.tilt), 0.1);
      head.rotation.y = v.pan + sway;
      head.rotation.x = v.tilt + Math.sin(t * 1.1) * 0.02;

      // body breathing
      root.position.y = Math.sin(t * 1.3) * 0.04;

      // arms
      const g = armGesture(L.face);
      let tgtL, tgtR;
      if (g === 'up') { tgtL = -2.5; tgtR = 2.5; }
      else if (g === 'down') { tgtL = -0.15; tgtR = 0.15; }
      else if (g === 'wave') { tgtL = -0.4; tgtR = -2.2 + Math.sin(t * 9) * 0.5; }   // right arm waves
      else { tgtL = -0.5 + Math.sin(t * 1.2) * 0.08; tgtR = 0.5 - Math.sin(t * 1.2) * 0.08; }
      v.armL = approach(v.armL, tgtL, 0.14);
      v.armR = approach(v.armR, tgtR, 0.14);
      armL.rotation.z = v.armL;
      armR.rotation.z = v.armR;

      // dragging
      root.rotation.y = approach(root.rotation.y, drag.ry, drag.on ? 1 : 0.2);
      root.rotation.x = approach(root.rotation.x, drag.rx, drag.on ? 1 : 0.2);

      drawFace(now);
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(frame);

    // ---------- cleanup ----------
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      dom.removeEventListener('pointerdown', down);
      dom.removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      if (dom.parentNode === host) host.removeChild(dom);
      made.forEach(o => { if (o.dispose) o.dispose(); });
      renderer.dispose();
    };
  }, []);

  return <div className="r3d" ref={mount} aria-hidden="true" />;
}
