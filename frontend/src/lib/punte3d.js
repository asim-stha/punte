// The Punte robot drawn as real 3D shapes with Three.js, so it looks right from every side.
// The page gives it the mood, head turn and talking state; it draws the robot, the face and the floating rings.
const MOOD = { n: '#5ef0ff', happy: '#FFD93D', sad: '#4CC3FF', angry: '#FF6B6B', sleepy: '#B79CFF', wow: '#FF9F1C', love: '#FF8AC0', think: '#5EEAD4' };
const TILT_OFF = { sad: -9, sleepy: -14, happy: 4, angry: 3 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rad = d => d * Math.PI / 180;

// torso outline: pointed at the bottom, widest near the shoulders
const T_BOT = -1.15, T_TOP = 1.1, T_MID = 0.3, T_W = 0.96;
const torsoR = y => {
  y = clamp(y, T_BOT, T_TOP);
  const below = y <= T_MID, n = below ? 1.9 : 2.5;
  const d = below ? (T_MID - y) / (T_MID - T_BOT) : (y - T_MID) / (T_TOP - T_MID);
  return T_W * Math.pow(Math.max(1 - Math.pow(d, n), 0), 1 / n);
};
const T_DEPTH = 0.88;

export function createPunte(THREE, canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'default' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 1, 40);
  const own = [];                                                  // things to free on dispose
  const keep = o => { own.push(o); return o; };

  // soft studio reflections for the glossy white plastic
  {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, 256);
    bg.addColorStop(0, '#e9f0ff'); bg.addColorStop(0.45, '#ffffff'); bg.addColorStop(0.55, '#aab4c8'); bg.addColorStop(1, '#2b2560');
    g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
    g.fillStyle = '#ffffff';
    g.fillRect(70, 40, 90, 60); g.fillRect(350, 30, 110, 70);
    g.fillStyle = '#cfe6ff'; g.fillRect(250, 60, 40, 40);
    const tex = keep(new THREE.CanvasTexture(c));
    tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace;
    const pm = new THREE.PMREMGenerator(renderer);
    const env = pm.fromEquirectangular(tex);
    scene.environment = env.texture; keep(env); pm.dispose();
  }
  const key = new THREE.DirectionalLight(0xffffff, 1.5); key.position.set(-2.5, 4, 5); scene.add(key);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x403a80, 0.7));
  const rim = new THREE.PointLight(0x5ef0ff, 18, 9); rim.position.set(2.5, 1.5, -3); scene.add(rim);

  const white = keep(new THREE.MeshPhysicalMaterial({ color: 0xf4f6f9, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.85 }));
  const grey = keep(new THREE.MeshPhysicalMaterial({ color: 0xcdd3dc, roughness: 0.35, clearcoat: 0.6, envMapIntensity: 0.7 }));
  const black = keep(new THREE.MeshPhysicalMaterial({ color: 0x05070a, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.3 }));
  const glow = keep(new THREE.MeshBasicMaterial({ color: MOOD.n, toneMapped: false }));
  const glowSoft = keep(new THREE.MeshBasicMaterial({ color: MOOD.n, toneMapped: false, transparent: true, opacity: 0.55 }));
  const add = (parent, geo, mat) => { const m = new THREE.Mesh(keep(geo), mat); parent.add(m); return m; };

  const root = new THREE.Group(); scene.add(root);
  const view = new THREE.Group(); root.add(view);                  // drag to look around the robot

  // ---- body ----
  const body = new THREE.Group(); view.add(body);
  {
    const pts = [];
    for (let i = 0; i <= 72; i++) { const y = T_BOT + (T_TOP - T_BOT) * i / 72; pts.push(new THREE.Vector2(Math.max(torsoR(y), 0.001), y)); }
    const torso = add(body, new THREE.LatheGeometry(pts, 72), white); torso.scale.z = T_DEPTH;
    // chest plate
    const py = 0.12, pz = torsoR(py) * T_DEPTH;
    const rimP = add(body, new THREE.SphereGeometry(1, 40, 28), grey); rimP.scale.set(0.62, 0.5, 0.1); rimP.position.set(0, py, pz - 0.035);
    const plate = add(body, new THREE.SphereGeometry(1, 40, 28), white); plate.scale.set(0.58, 0.46, 0.1); plate.position.set(0, py, pz - 0.028);
    // sound bars on the plate (move while Punte talks)
    var bars = [];
    for (let i = 0; i < 5; i++) {
      const m = add(body, new THREE.CapsuleGeometry(0.035, 0.1, 4, 8), glow);
      m.position.set((i - 2) * 0.13, py, pz + 0.075); m.scale.set(1, 0.001, 1); bars.push(m);
    }
    // collar where the head sits
    const collar = add(body, new THREE.TorusGeometry(0.62, 0.07, 14, 48), black); collar.rotation.x = Math.PI / 2; collar.position.y = 0.72; collar.scale.set(1, T_DEPTH, 1);
  }
  const arms = [-1, 1].map(side => {
    const pivot = new THREE.Group(); pivot.position.set(side * (torsoR(0.55) + 0.1), 0.55, -0.04); body.add(pivot);
    const arm = add(pivot, new THREE.CapsuleGeometry(0.2, 0.78, 10, 24), white); arm.position.y = -0.52; arm.scale.z = 0.92;
    return pivot;
  });

  // ---- head ----
  const head = new THREE.Group(); head.position.set(0, 1.62, 0.02); view.add(head);
  add(head, new THREE.SphereGeometry(1, 72, 52), white).scale.set(1.17, 0.95, 1.0);
  [-1, 1].forEach(side => {
    const bump = add(head, new THREE.SphereGeometry(1, 24, 18), white); bump.scale.set(0.2, 0.14, 0.17); bump.position.set(side * 0.62, 0.85, -0.1);
    const ear = new THREE.Group(); ear.position.set(side * 1.2, -0.03, -0.03); ear.rotation.z = -side * 0.06; head.add(ear);
    const cup = add(ear, new THREE.CapsuleGeometry(0.26, 0.34, 10, 28), white); cup.scale.z = 0.95;
    const ring = add(ear, new THREE.TorusGeometry(0.17, 0.018, 10, 40), glow); ring.rotation.y = Math.PI / 2; ring.position.x = side * 0.262;
    const pole = add(head, new THREE.CylinderGeometry(0.024, 0.024, 0.62, 10), black); pole.position.set(side * 1.22, 0.7, -0.08); pole.rotation.z = -side * 0.05;
  });
  const tips = [-1, 1].map(side => {
    const t = add(head, new THREE.SphereGeometry(0.06, 16, 12), glow); t.position.set(side * 1.235, 1.02, -0.08); return t;
  });
  // visor: a dark glossy bulge on the front with the face drawn on it
    const visor = add(head, new THREE.SphereGeometry(1, 56, 40), black); visor.scale.set(0.92, 0.64, 0.46); visor.position.set(0, -0.02, 0.56);

  const fc = document.createElement('canvas'); fc.width = 512; fc.height = 362;
  const fctx = fc.getContext('2d');
  const faceTex = keep(new THREE.CanvasTexture(fc)); faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const faceMat = keep(new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  {
    const geo = keep(new THREE.PlaneGeometry(1.84, 1.3, 80, 56));
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      const u = (x / 0.92) ** 2 + (y / 0.64) ** 2;
      p.setZ(i, 0.56 + 0.46 * Math.sqrt(Math.max(1 - u, 0.0)) + 0.02);
    }
    geo.computeVertexNormals();
    const face = new THREE.Mesh(geo, faceMat); face.position.y = -0.02; face.renderOrder = 2; head.add(face);
  }

  // ---- floating rings and floor glow ----
  const rings = new THREE.Group(); rings.position.y = -1.55; view.add(rings);
  const r1 = add(rings, new THREE.TorusGeometry(0.95, 0.035, 12, 80), glow); r1.rotation.x = Math.PI / 2;
  const r2 = add(rings, new THREE.TorusGeometry(1.15, 0.015, 8, 80), glowSoft); r2.rotation.x = Math.PI / 2; r2.position.y = -0.22;
  {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    var discMat = keep(new THREE.MeshBasicMaterial({ map: keep(new THREE.CanvasTexture(c)), color: MOOD.n, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    const disc = add(rings, new THREE.CircleGeometry(1.5, 48), discMat); disc.rotation.x = -Math.PI / 2; disc.position.y = -0.04;
  }

  // ---- the face picture ----
  const shade = col => '#' + new THREE.Color(col).multiplyScalar(0.55).getHexString();
  function drawFace(s) {
    const g = fctx, W = 512, H = 362;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
    g.save();
    g.beginPath(); g.ellipse(W / 2, H / 2, 236, 158, 0, 0, Math.PI * 2); g.clip();         // nothing is drawn outside the black visor
    g.translate(W / 2, H / 2); g.scale(1.2, 1.2); g.translate(-W / 2, -H / 2);
    const col = s.color, ey0 = 152, mx = W / 2, my = 262;
    const eyeOpen = s.asleep ? 0.06 : s.blink;
    const wob = s.f === 'think' ? [14, -10] : [0, 0];
    const eyes = [-1, 1].map(side => ({ side, x: mx + side * 114 + s.ex + wob[0], y: ey0 + s.ey + wob[1] }));
    g.lineCap = 'round'; g.lineJoin = 'round';
    const ball = (x, y, rx, ry) => {
      g.save(); g.shadowColor = col; g.shadowBlur = 38;
      const gr = g.createRadialGradient(x, y - ry * 0.1, 3, x, y, Math.max(rx, ry));
      gr.addColorStop(0, '#f4ffff'); gr.addColorStop(0.18, '#f4ffff'); gr.addColorStop(0.6, col); gr.addColorStop(1, shade(col));
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); g.restore();
    };
    const lidded = (e, r, cut) => {                                   // eye with part of its top covered; cut = [y at outer edge, y at inner edge] as fractions of r
      ball(e.x, e.y, r, r);                                           // glow first
      g.save(); g.beginPath(); g.rect(e.x - r - 40, e.y - r - 40, r * 2 + 80, r * 2 + 80); g.clip();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath();
      const xo = e.x + e.side * (r + 40), xi = e.x - e.side * (r + 40);
      g.moveTo(xo, e.y - r - 60); g.lineTo(xi, e.y - r - 60);
      g.lineTo(xi, e.y + cut[1] * r); g.lineTo(xo, e.y + cut[0] * r); g.closePath(); g.fill(); g.restore();
    };
    eyes.forEach(e => {
      const r = 60;
      if (s.asleep) { g.strokeStyle = col; g.lineWidth = 12; g.shadowColor = col; g.shadowBlur = 24; g.beginPath(); g.arc(e.x, e.y - 10, 36, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); g.shadowBlur = 0; return; }
      switch (s.f) {
        case 'happy':
          g.save(); g.strokeStyle = col; g.lineWidth = 22; g.shadowColor = col; g.shadowBlur = 30;
          g.beginPath(); g.arc(e.x, e.y + 26, 50, Math.PI * 1.08, Math.PI * 1.92); g.stroke(); g.restore(); break;
        case 'sad': lidded(e, r, [-0.1, -1.0].map(v => v)); break;
        case 'angry': lidded(e, r, [-1.1, 0.15]); break;
        case 'sleepy': lidded(e, r, [-0.05, -0.05]); break;
        case 'wow': ball(e.x, e.y - 2, 66, 68 * eyeOpen); break;
        case 'love': {
          const k = 1 + 0.12 * Math.sin(s.t * 7);
          g.save(); g.shadowColor = col; g.shadowBlur = 36; g.fillStyle = col;
          g.translate(e.x, e.y + 4); g.scale(k * 0.75, k * 0.75);
          g.beginPath(); g.moveTo(0, 52); g.bezierCurveTo(-90, -4, -48, -66, 0, -26); g.bezierCurveTo(48, -66, 90, -4, 0, 52); g.closePath(); g.fill(); g.restore(); break;
        }
        case 'think': ball(e.x, e.y + (e.side > 0 ? 8 : 0), e.side > 0 ? 44 : r, (e.side > 0 ? 44 : r) * eyeOpen); break;
        default: ball(e.x, e.y, r, r * eyeOpen);
      }
    });
    // mouth
    g.save(); g.strokeStyle = col; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 20; g.lineWidth = 11;
    if (s.talk > 0.02 && !s.asleep) {
      const h = 8 + s.talk * 34; g.beginPath(); g.roundRect ? g.roundRect(mx - 30, my - h / 2, 60, h, 14) : g.rect(mx - 30, my - h / 2, 60, h); g.fill();
    } else if (s.asleep || s.f === 'sleepy') { g.lineWidth = 8; g.globalAlpha = 0.75; g.beginPath(); g.arc(mx, my, 11, 0, Math.PI * 2); g.stroke(); }
    else if (s.f === 'happy' || s.f === 'love') { g.beginPath(); g.arc(mx, my - 18, 40, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
    else if (s.f === 'sad') { g.beginPath(); g.arc(mx, my + 28, 34, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
    else if (s.f === 'wow') { g.beginPath(); g.ellipse(mx, my, 14, 20, 0, 0, Math.PI * 2); g.stroke(); }
    else if (s.f === 'think') { g.beginPath(); g.moveTo(mx - 12, my + 4); g.lineTo(mx + 26, my - 4); g.stroke(); }
    else if (s.f === 'angry') { g.beginPath(); g.moveTo(mx - 26, my); g.lineTo(mx + 26, my); g.stroke(); }
    else { g.lineWidth = 8; g.beginPath(); g.moveTo(mx - 18, my); g.lineTo(mx + 18, my); g.stroke(); }
    g.restore();
    g.restore();
    faceTex.needsUpdate = true;
  }

  // ---- state and animation ----
  const st = { f: 'n', asleep: false, pan: 0, tilt: 0, talking: false, listening: false, fast: false };
  let lean = 0, stretch = 0;
  const cur = { pan: 0, tilt: 0, bodyPan: 0 };
  const mood = new THREE.Color(MOOD.n);
  const view3 = { yaw: 0, pitch: 0, drag: false, last: 0 };
  let react = null, lastF = 'n', blinkT = 0, nextBlink = 2.5, ex = 0, ey = 0, nextEye = 3, faceKey = '', talkPh = 0, size = { w: 1, h: 1 };
  let raf = 0, last = performance.now(), t = 0, frame = 0, dead = false;

  function setState(p) {
    const wasAsleep = st.asleep;
    Object.assign(st, p);
    if (wasAsleep && !st.asleep) { react = { type: 'wake', t0: t }; blinkT = 0.13; nextBlink = 0.5; }
    const f = st.asleep ? 'sleepy' : st.f;
    if (st.f !== lastF && st.f !== 'n') react = { type: st.f, t0: t };
    lastF = st.f;
    mood.set(MOOD[f] || MOOD.n);
  }

  function resize() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    size = { w, h };
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const small = w <= 860, tan = Math.tan(rad(camera.fov / 2));
    const dH = (4.4 / (small ? 0.42 : 0.66)) / (2 * tan);
    const dW = (3.5 / (small ? 0.92 : 0.7)) / (2 * tan * camera.aspect);
    const d = Math.max(dH, dW);
    const ly = small ? 0.62 : 0.28;
    camera.position.set(0, ly, d); camera.lookAt(0, ly, 0);
    camera.updateProjectionMatrix();
  }

  // drag to look around the robot, double click to come back to the front
  const down = e => { view3.drag = true; view3.px = e.clientX; view3.py = e.clientY; canvas.setPointerCapture(e.pointerId); };
  const move = e => {
    if (!view3.drag) return;
    view3.yaw += (e.clientX - view3.px) * 0.009; view3.pitch = clamp(view3.pitch + (e.clientY - view3.py) * 0.005, -0.5, 0.5);
    view3.px = e.clientX; view3.py = e.clientY; view3.last = t;
  };
  const up = () => { view3.drag = false; view3.last = t; };
  const reset = () => { view3.yaw = Math.round(view3.yaw / (Math.PI * 2)) * Math.PI * 2; view3.pitch = 0; view3.last = -99; };
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('dblclick', reset);

  const proj = new THREE.Vector3();
  function tick(now) {
    if (dead) return;
    raf = requestAnimationFrame(tick);
    if (document.hidden) { last = now; return; }
    const dt = Math.min((now - last) / 1000, 0.05); last = now; t += dt; frame++;
    const f = st.asleep ? 'sleepy' : st.f;

    // head and body follow the pan and tilt they are given
    const k = 1 - Math.exp(-dt * (st.fast ? 16 : 7));
    cur.pan += (clamp(st.pan, -180, 180) - cur.pan) * k;
    cur.tilt += (clamp(st.tilt + (TILT_OFF[f] || 0) + (st.listening && !st.asleep ? 5 : 0), -40, 40) - cur.tilt) * k;
    lean += ((st.listening && !st.asleep ? 0.08 : 0) - lean) * (1 - Math.exp(-dt * 5));
    cur.bodyPan += (clamp(st.pan, -180, 180) * 0.3 - cur.bodyPan) * (1 - Math.exp(-dt * 4));
    head.rotation.y = rad(cur.pan);
    head.rotation.x = -rad(cur.tilt) * 1.3;
    head.rotation.z = Math.sin(t * 0.9) * 0.012 + lean;
    body.rotation.y = rad(cur.bodyPan);

    // arms
    const wave = Math.sin(t * 9) * 0.22;
    const tgt = { l: -0.1 + Math.sin(t * 1.4) * 0.03, r: 0.1 - Math.sin(t * 1.4) * 0.03 };
    if (!st.asleep) {
      if (f === 'happy') { tgt.l = -2.5 + wave; tgt.r = 2.5 - wave; }
      else if (f === 'love') { tgt.l = -2.4 + wave; }
      else if (f === 'wow') { tgt.l = -0.7; tgt.r = 0.7; }
      else if (f === 'angry') { tgt.l = 0.05; tgt.r = -0.05; }
      else if (f === 'think') { tgt.r = 2.2 + Math.sin(t * 2) * 0.05; }
    }
    if (stretch > 0) { tgt.l = -2.7 * stretch; tgt.r = 2.7 * stretch; }
    arms[0].rotation.z += (tgt.l - arms[0].rotation.z) * (1 - Math.exp(-dt * 9));
    arms[1].rotation.z += (tgt.r - arms[1].rotation.z) * (1 - Math.exp(-dt * 9));

    // floating and the small reaction when the mood changes
    let ox = 0, oy = Math.sin(t * (st.asleep ? 0.8 : 1.4)) * 0.05, rz = 0, sc = 1;
    stretch = 0;
    if (react) {
      const a = (t - react.t0) / (react.type === 'wake' ? 1.4 : 0.9);
      if (a >= 1) react = null;
      else {
        const s = Math.sin(a * Math.PI);
        if (react.type === 'happy') oy += Math.abs(Math.sin(a * Math.PI * 2.5)) * 0.35 * (1 - a);
        else if (react.type === 'angry') ox += Math.sin(a * Math.PI * 9) * 0.07 * (1 - a);
        else if (react.type === 'love') rz += Math.sin(a * Math.PI * 4) * 0.07 * (1 - a);
        else if (react.type === 'wow') { oy += s * 0.4; sc += s * 0.05; }
        else if (react.type === 'sad') oy -= s * 0.15;
        else if (react.type === 'sleepy') { rz -= s * 0.05; oy -= s * 0.08; }
        else if (react.type === 'think') rz += s * 0.05;
        else if (react.type === 'wake') { stretch = s; oy += s * 0.22; sc += s * 0.05; }
      }
    }
    root.position.set(ox, oy, 0); root.rotation.z = rz; root.scale.setScalar(sc);

    // looking around the robot comes back to the front after a pause
    if (!view3.drag && t - view3.last > 6) {
      const kk = 1 - Math.exp(-dt * 1.6);
      view3.yaw += (Math.round(view3.yaw / (Math.PI * 2)) * Math.PI * 2 - view3.yaw) * kk; view3.pitch -= view3.pitch * kk;
    }
    view.rotation.y = view3.yaw; view.rotation.x = view3.pitch;

    // glow colours, antenna lights, sound bars, rings
    glow.color.lerp(mood, 1 - Math.exp(-dt * 6)); glowSoft.color.copy(glow.color); discMat.color.copy(glow.color); rim.color.copy(glow.color);
    const active = st.listening || st.talking;
    tips.forEach(m => { m.scale.setScalar(active ? 1.5 + Math.sin(t * 8) * 0.25 : 0.7); });
    bars.forEach((m, i) => {
      const h = st.talking ? 0.25 + 0.75 * Math.abs(Math.sin(t * 8 + i * 1.3)) : 0.001;
      m.scale.y += (h * 3 - m.scale.y) * 0.3; m.visible = m.scale.y > 0.05;
    });
    const pulse = 0.55 + 0.45 * Math.sin(t * 2.8);
    glowSoft.opacity = 0.25 + pulse * 0.3; discMat.opacity = 0.3 + pulse * 0.2; r1.scale.setScalar(1 + pulse * 0.02);

    // face: blinking, wandering eyes, mouth
    blinkT -= dt; nextBlink -= dt; nextEye -= dt;
    if (nextBlink <= 0) { blinkT = 0.13; nextBlink = 2.2 + Math.random() * 3.8; }
    if (nextEye <= 0) { nextEye = 3 + Math.random() * 1.5; ex = (st.asleep || st.talking) ? 0 : Math.round((Math.random() - 0.5) * 24); ey = (st.asleep || st.talking) ? 0 : Math.round((Math.random() - 0.5) * 12); }
    talkPh += st.talking ? dt * 11 : 0;
    const talk = st.talking ? 0.5 + 0.5 * Math.sin(talkPh) : 0;
    const fs = { f, asleep: st.asleep, color: '#' + glow.color.getHexString(), blink: blinkT > 0 ? 0.08 : 1, ex, ey, talk, t };
    const keyNow = [f, st.asleep, fs.color, fs.blink, ex, ey, Math.round(talk * 6), f === 'love' ? Math.round(t * 20) : 0].join('|');
    if (keyNow !== faceKey) { faceKey = keyNow; drawFace(fs); }

    // where the speech bubble should sit (just above the head)
    if (opts.onProject && frame % 4 === 0) {
      proj.set(0, 1.62 + 1.0, 0); head.localToWorld(proj.set(0, 1.05, 0)); proj.y = Math.max(proj.y, 2.2); proj.project(camera);
      opts.onProject((proj.x * 0.5 + 0.5) * size.w, (-proj.y * 0.5 + 0.5) * size.h);
    }
    renderer.render(scene, camera);
  }

  resize();
  drawFace({ f: 'n', asleep: false, color: MOOD.n, blink: 1, ex: 0, ey: 0, talk: 0, t: 0 });
  raf = requestAnimationFrame(tick);

  return {
    setState, resize, resetView: reset,
    dispose() {
      dead = true; cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('dblclick', reset);
      own.forEach(o => o.dispose && o.dispose());
      renderer.dispose(); renderer.forceContextLoss();
    }
  };
}
