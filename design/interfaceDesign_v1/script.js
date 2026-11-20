/* Punte Dashboard logic: navigation, ESP32 connection, face tracking, voice, memory */
const $ = id => document.getElementById(id), V = $('v');
const EX = {neutral:0, happy:1, sad:2, angry:3, sleepy:4, surprised:5, love:6, think:7};
const NAMES = ['Neutral','Happy','Sad','Angry','Sleepy','Surprised','Love','Think'];
const CLS = ['','happy','sad','angry','sleepy','wow','love','think','happy'];
const GAIN = 35, SIGN = 1;   // SIGN = -1 if the head turns away from your face
let ws, mem = {facts: [], chat: []}, faces = [], cur, speaking = false, listening = false, rec,
    lastSend = 0, lastRec = 0, lastDesc = null, awaitName = false, started = false, stream = null;
const S = Object.assign({greet: true, remember: true, cam: true, mic: true, track: true, rate: 1, voice: '', ip: '', ol: 'http://localhost:11434', md: 'llama3.2:3b'}, JSON.parse(localStorage.punte || '{}'));
const keep = () => localStorage.punte = JSON.stringify(S);

/* theme + navigation */
const setTheme = t => { document.documentElement.dataset.theme = t; localStorage.punteTheme = t; };
setTheme(localStorage.punteTheme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
$('theme').onclick = () => setTheme(document.documentElement.dataset.theme == 'dark' ? 'light' : 'dark');
const ICO = {home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', chat: 'M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.6A8 8 0 1 1 21 12z',
  control: 'M4 6h10M18 6h2M4 12h2M10 12h10M4 18h11M19 18h1M16 4v4M8 10v4M17 16v4', memory: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1'};
const SUB = {home: 'Punte at a glance', chat: 'Talk or type to Punte', control: 'Expressions, head and music', memory: 'What Punte remembers', settings: 'Connection and preferences'};
const VIEWS = ['home', 'chat', 'control', 'memory', 'settings'];
$('nav').innerHTML = VIEWS.map(v => '<button class="nv" data-v="' + v + '"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + ICO[v] + '"/></svg>' + v[0].toUpperCase() + v.slice(1) + '</button>').join('');
function show(v) {
  VIEWS.forEach(x => $('v-' + x).hidden = x != v);
  document.querySelectorAll('.nv[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v == v));
  $('title').textContent = v[0].toUpperCase() + v.slice(1); $('sub').textContent = SUB[v]; localStorage.punteView = v;
}
document.querySelectorAll('.nv[data-v]').forEach(b => b.onclick = () => show(b.dataset.v));
$('logo').onclick = e => { e.preventDefault(); show('home'); window.scrollTo(0, 0); };

/* status */
function badge(t) { $('badget').textContent = t; $('st2').textContent = t; $('badge').className = 'pill' + (t == 'Idle' ? '' : ' live'); }
function conn(ok, t) { $('conn').className = 'pill ' + (ok ? 'ok' : 'bad'); $('connt').textContent = t; }
function addr() { const o = S.ol.replace(/^https?:\/\//, ''); $('addr').textContent = 'Punte ' + (S.ip || '-') + '  |  Ollama ' + o; $('h-ip').textContent = S.ip || '-'; $('h-ol').textContent = o; $('h-md').textContent = S.md; }
function who(n) { $('who').textContent = $('who2').textContent = n; }
function setFace(n) {
  document.querySelectorAll('.oled[data-f]').forEach(f => {
    f.className = 'oled ' + (f.classList.contains('mini') ? 'mini ' : '') + (CLS[n] || '');
    f.innerHTML = n == 6 ? '<span class="hh">&#9829;</span><span class="hh">&#9829;</span>' : '<i class="e"></i><i class="e"></i>'; });
  document.querySelectorAll('#ex .btn').forEach((b, i) => b.classList.toggle('on', i == n));
}
addr(); badge('Idle');

/* helpers */
const base = () => 'http://' + S.ip;
const send = s => { if (ws && ws.readyState == 1) ws.send(s); if (s.startsWith('x:')) setFace(+s.slice(2)); };
const load = async k => { try { return JSON.parse(await (await fetch(base() + '/store?k=' + k)).text()); } catch (e) { return null; } };
const save = (k, o) => fetch(base() + '/store?k=' + k, {method: 'POST', body: JSON.stringify(o)}).catch(() => {});
const OPT = () => new faceapi.TinyFaceDetectorOptions({inputSize: 224, scoreThreshold: .5});
function msg(cls, t) { const d = document.createElement('div'); d.className = 'm ' + cls; d.textContent = t; $('log').appendChild(d); $('log').scrollTop = 1e9; }
const log = t => msg('sys', t);
function toggle(id, key, cb) {
  const b = $(id), paint = () => { b.classList.toggle('on', !!S[key]); b.setAttribute('aria-checked', !!S[key]); };
  b.onclick = () => { S[key] = !S[key]; keep(); paint(); cb && cb(S[key]); }; paint();
}

/* controls */
$('ex').innerHTML = NAMES.map((n, i) => '<button class="btn" data-x="' + i + '">' + n + '</button>').join('');
document.querySelectorAll('[data-x]').forEach(b => b.onclick = () => send('x:' + b.dataset.x));
document.querySelectorAll('[data-c]').forEach(b => b.onclick = () => send(b.dataset.c));
$('play').onclick = () => send('m:' + $('song').value); $('stop').onclick = () => send('m:-1');
toggle('trk', 'track'); toggle('t-greet', 'greet'); toggle('t-rem', 'remember');
toggle('t-cam', 'cam', on => on ? startCam() : stopCam());
toggle('t-mic', 'mic', on => { if (!on && listening) $('mic').click(); setMic(); });
function setMic() { [$('mic'), $('mic2')].forEach(b => { b.disabled = !S.mic; b.style.opacity = S.mic ? 1 : .4; }); }
setMic();

/* memory view */
function render() {
  $('n-faces').textContent = faces.length; $('n-facts').textContent = mem.facts.length; $('n-chat').textContent = mem.chat.length;
  const t = $('tl'); t.innerHTML = '';
  if (!mem.chat.length) t.innerHTML = '<div class="empty">No conversations yet.</div>';
  else mem.chat.forEach(m => { const d = document.createElement('div'); d.className = 'ti';
    d.innerHTML = '<small></small><span></span>'; d.firstChild.textContent = m.role == 'user' ? 'You' : 'Punte'; d.lastChild.textContent = m.content; t.appendChild(d); });
  const f = $('facts'); f.innerHTML = mem.facts.length ? '' : '<span class="empty">Nothing saved yet.</span>';
  mem.facts.forEach((x, i) => { const c = document.createElement('span'); c.className = 'chip';
    c.innerHTML = '<span></span><button class="x" aria-label="Delete">&#10005;</button>'; c.firstChild.textContent = x;
    c.lastChild.onclick = () => { mem.facts.splice(i, 1); save('mem', mem); render(); }; f.appendChild(c); });
  const p = $('ppl'); p.innerHTML = faces.length ? '' : '<div class="empty">No faces learned yet.</div>';
  faces.forEach((x, i) => { const r = document.createElement('div'); r.className = 'line';
    r.innerHTML = '<div class="row"><span class="av"></span><b></b></div><button class="x" aria-label="Delete">&#10005;</button>';
    r.querySelector('.av').textContent = x.n[0].toUpperCase(); r.querySelector('b').textContent = x.n;
    r.lastChild.onclick = () => { faces.splice(i, 1); save('faces', faces); render(); }; p.appendChild(r); });
}
$('addfact').onclick = () => { const t = prompt('What should Punte remember?'); if (t && t.trim()) { mem.facts.push(t.trim()); save('mem', mem); render(); } };
const clrChat = () => { mem.chat = []; save('mem', mem); render(); };
$('clrchat').onclick = $('clr2').onclick = clrChat;
$('clrall').onclick = () => { if (confirm('Clear all memory?')) { mem = {facts: [], chat: []}; save('mem', mem); render(); } };
render();

/* settings */
['ip', 'ol', 'md'].forEach(k => $(k).value = S[k]);
$('rt').value = S.rate; $('rt').oninput = () => { S.rate = +$('rt').value; keep(); };
function voices() { const l = speechSynthesis.getVoices(); $('vc').innerHTML = '<option value="">Default</option>' + l.map(v => '<option>' + v.name + '</option>').join(''); $('vc').value = S.voice; }
voices(); speechSynthesis.onvoiceschanged = voices; $('vc').onchange = () => { S.voice = $('vc').value; keep(); };
$('save').onclick = () => { ['ip', 'ol', 'md'].forEach(k => S[k] = $(k).value.trim()); keep(); addr(); connect(); };
$('go').onclick = () => { if (!S.ip) { show('settings'); $('ip').focus(); } else connect(); };

async function startCam() {
  try { stream = await navigator.mediaDevices.getUserMedia({video: true}); V.srcObject = stream; V.onloadeddata = loop; $('vph').hidden = true; }
  catch (e) { $('vph').textContent = 'Camera unavailable'; log('Camera unavailable: ' + e); }
}
function stopCam() { stream && stream.getTracks().forEach(t => t.stop()); stream = null; V.srcObject = null; who('-'); cur = undefined; $('vph').hidden = false; $('vph').textContent = 'Camera is off'; }

async function connect() {
  conn(false, 'Connecting...');
  if (ws) ws.close();
  ws = new WebSocket('ws://' + S.ip + ':81');
  ws.onopen = () => { conn(true, 'Connected'); log('Punte linked'); send('x:1'); };
  ws.onclose = () => { conn(false, 'Link lost'); };
  mem = Object.assign(mem, await load('mem') || {}); faces = await load('faces') || []; render();
  if (started) return;
  const M = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
  try {
    await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(M), faceapi.nets.faceLandmark68Net.loadFromUri(M), faceapi.nets.faceRecognitionNet.loadFromUri(M)]);
    started = true; if (S.cam) await startCam();
    log('Ready: ' + faces.length + ' faces, ' + mem.facts.length + ' memories');
  } catch (e) { log('Face models unavailable: ' + e); }
}

/* face tracking + recognition */
async function loop() {
  if (!stream) return;
  const d = await faceapi.detectSingleFace(V, OPT());
  if (d) {
    const b = d.box, err = (b.x + b.width / 2) / V.videoWidth - .5;
    if (S.track && Math.abs(err) > .07 && Date.now() - lastSend > 300) { send('n:' + (err * GAIN * SIGN).toFixed(1)); lastSend = Date.now(); }
    if (Date.now() - lastRec > 3000) { lastRec = Date.now(); await recognize(); }
  } else if (cur !== undefined && Date.now() - lastRec > 8000) { cur = undefined; who('-'); }
  requestAnimationFrame(loop);
}
async function recognize() {
  const f = await faceapi.detectSingleFace(V, OPT()).withFaceLandmarks().withFaceDescriptor();
  if (!f) return;
  lastDesc = f.descriptor;
  let best = null, bd = .5;
  for (const p of faces) { const x = faceapi.euclideanDistance(p.d, f.descriptor); if (x < bd) { bd = x; best = p.n; } }
  if (best !== cur) {
    cur = best; who(best || 'unknown');
    if (best) { if (S.greet) say('Hi ' + best + '!', 'happy'); }
    else { awaitName = true; say("I don't know you yet. What's your name?", 'think'); }
  }
}
function learn(name) {
  if (!lastDesc) return log('No face captured yet');
  faces.push({n: name, d: Array.from(lastDesc).map(x => +x.toFixed(3))});
  save('faces', faces); cur = name; who(name); render();
}
const learnUI = () => { const n = prompt('Name?'); if (n) { learn(n.trim()); say('Nice to meet you, ' + n.trim(), 'happy'); } };
$('learn').onclick = $('learn2').onclick = learnUI;

/* talk */
function say(t, e = 'neutral') {
  send('x:' + (EX[e] ?? 0)); msg('bot', t);
  const u = new SpeechSynthesisUtterance(t); u.rate = S.rate;
  const v = speechSynthesis.getVoices().find(x => x.name == S.voice); if (v) u.voice = v;
  speaking = true; badge('Speaking'); send('t:1');
  u.onend = () => { speaking = false; badge(listening ? 'Listening' : 'Idle'); send('t:0'); setTimeout(() => send('x:0'), 3000); };
  speechSynthesis.speak(u);
}
async function route(t) {
  msg('me', t);
  const s = t.toLowerCase();
  if (awaitName) { awaitName = false; const n = t.replace(/my name is|i am|i'm|this is|it's/ig, '').trim().split(' ')[0]; learn(n); return say('Nice to meet you, ' + n + '!', 'love'); }
  if (/stop (the )?(music|song)/.test(s)) { send('m:-1'); return say('Stopped.', 'neutral'); }
  if (/play.*(music|song)/.test(s)) { send('m:' + Math.floor(Math.random() * 3)); return; }
  if (/(turn|rotate|look) left/.test(s)) return send('r:-45');
  if (/(turn|rotate|look) right/.test(s)) return send('r:45');
  if (/spin|360/.test(s)) return send('r:360');
  if (/face front|look front/.test(s)) return send('p:0');
  ask(t);
}
async function ask(text) {
  const sys = `You are Punte, a small friendly desk robot with an OLED face. Reply in 1-2 short sentences. ` +
    `Start the reply with one tag: [neutral], [happy], [sad], [angry], [sleepy], [surprised], [love] or [think]. ` +
    `If something is worth remembering about the user, add a final line "REMEMBER: <fact>". ` +
    `Person in front of you: ${cur || 'unknown'}.\nKnown facts:\n- ${mem.facts.join('\n- ')}`;
  mem.chat.push({role: 'user', content: (cur ? cur + ': ' : '') + text}); mem.chat = mem.chat.slice(-12);
  send('x:7'); badge('Thinking');
  try {
    const r = await fetch(S.ol + '/api/chat', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({model: S.md, stream: false, messages: [{role: 'system', content: sys}, ...mem.chat]})});
    let a = (await r.json()).message.content;
    a = a.replace(/REMEMBER:(.*)/g, (_, f) => { mem.facts.push(f.trim()); return ''; }).trim(); mem.facts = mem.facts.slice(-50);
    const m = a.match(/^\s*\[(\w+)\]/); const tag = m ? m[1].toLowerCase() : 'neutral';
    a = a.replace(/^\s*\[\w+\]\s*/, '');
    mem.chat.push({role: 'assistant', content: a});
    if (S.remember) save('mem', mem); else mem.chat = [];
    render(); say(a, tag);
  } catch (e) { log('Ollama error: ' + e + ' (set OLLAMA_ORIGINS=*)'); send('x:2'); badge('Idle'); }
}
$('snd').onclick = () => { const t = $('txt').value.trim(); if (t) { $('txt').value = ''; route(t); } };
$('txt').onkeydown = e => { if (e.key == 'Enter') $('snd').click(); };
function mic() {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!R) return alert('Use Chrome');
  listening = !listening;
  [$('mic'), $('mic2')].forEach(b => b.classList.toggle('live', listening));
  badge(listening ? 'Listening' : 'Idle');
  if (!listening) { rec && rec.stop(); return; }
  rec = new R(); rec.continuous = true; rec.lang = 'en-US';
  rec.onresult = e => { const x = e.results[e.results.length - 1]; if (x.isFinal && !speaking) route(x[0].transcript.trim()); };
  rec.onend = () => listening && rec.start();
  rec.start();
}
$('mic').onclick = $('mic2').onclick = mic;
['Say hello', 'Play some music', 'Look left', 'Spin around'].forEach(t => { const b = document.createElement('button'); b.className = 'btn'; b.textContent = t; b.onclick = () => route(t); $('sugs').appendChild(b); });
msg('bot', "Hi! I'm Punte. Type a message or tap the microphone to talk.");
show(localStorage.punteView && VIEWS.includes(localStorage.punteView) ? localStorage.punteView : 'home');
