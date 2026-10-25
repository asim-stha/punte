// All of Punte's behaviour in one place: robot link, camera + faces, talking, voice, chat, memory.
// The views only show what this hook returns.
import { useEffect, useRef, useState } from 'react';
import { api, AuthError } from '../api';
import { EX, robotCommand, openCommand, smallTalk, greeting, farewell, idleAction, controlsRobot, showsFace, eventText, wakeNames, wakeSplit, systemPrompt, parseReply, keepFacts } from '../lib/commands';

const MODELS = '/vendor/face-api/model/';
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const OPT = () => new window.faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
const GAIN = 35;   // degrees of head turn for a face at the edge of the picture
const SIGN = 1;    // change to -1 if the head turns away from your face
const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const HELLO = { cls: 'bot', text: "Hi! I'm Punte. Type a message or tap the microphone to talk." };

class AiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

const CLOUD_WAIT = 15000;     // how long to wait for the cloud model before using the local one
const CLOUD_PAUSE = 120000;   // after a network problem, leave the cloud alone for this long
const LIMIT_WORDS = /limit|quota|usage|credit|upgrade|subscription|sign ?in|unauthorized/i;

// browser -> Ollama on this same computer (cloud models are reached through the same Ollama)
async function ollamaChat(base, model, messages, waitMs, extra = {}) {
  const url = base.replace(/\/$/, '') + '/api/chat';
  const call = async body => {
    let r;
    try {
      r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(waitMs), body: JSON.stringify(body) });
    } catch (e) {
      throw new AiError(e.name === 'TimeoutError' ? 'no answer after ' + Math.round(waitMs / 1000) + ' seconds'
        : 'cannot reach Ollama: ' + e.message + ' (is Ollama running, and does OLLAMA_ORIGINS allow this site?)');
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.message) throw new AiError(j.error || 'Ollama HTTP ' + r.status, r.status);
    return j.message.content || '';
  };
  try {
    return await call({ model, stream: false, messages, ...extra });
  } catch (e) {
    if (extra.think === false && /think/i.test(e.message)) {          // this model has no thinking switch: ask again without it
      const { think, ...rest } = extra;
      return call({ model, stream: false, messages, ...rest });
    }
    throw e;
  }
}

// Some models put their reasoning in <think> tags. It should never be spoken.
const noThinking = raw => String(raw).replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*<\/think>/i, '').trim();

export function useBuddy({ S, onLoggedOut }) {
  const [robot, setRobot] = useState(null);            // null = unknown, true = online, false = offline
  const [face, setFace] = useState(0);                 // which expression is shown
  const [badge, setBadge] = useState('Idle');
  const [messages, setMessages] = useState([HELLO]);
  const [who, setWho] = useState('-');
  const [cam, setCam] = useState({ on: false, note: 'Press Connect to start the camera' });
  const [started, setStarted] = useState(false);
  const [mood, setMood] = useState(null);               // the real robot's mood: { expr, state }
  const [head, setHead] = useState({ pan: 0, tilt: 0 }); // head turn shown by the 3D robot on the page
  const [robotCam, setRobotCam] = useState(false);       // is the ESP32-CAM connected to the server
  const [viewing, setViewing] = useState(false);         // is the Camera page open
  const [mem, setMem] = useState({ facts: [], chat: [] });
  const [faces, setFaces] = useState([]);
  const [info, setInfo] = useState({ model: '', storage: '' });
  const [listening, setListeningState] = useState(false);
  const [holding, setHolding] = useState(false);
  const [ai, setAi] = useState({ active: '', cloudOff: '' });   // active: 'cloud' | 'local' | ''; cloudOff: '' | 'session' | 'pause'
  const [models, setModels] = useState([]);                    // models installed in Ollama
  const [modelNote, setModelNote] = useState('');

  // Always holds the newest values, so long-running callbacks (camera loop, microphone) never use old ones.
  const live = useRef({});
  live.current = { S, mem, faces, robot, info };
  const x = useRef({
    ws: null, closing: false, timer: 0, video: null, stream: null, loop: 0,
    cur: undefined, speaking: false, thinking: false, sayId: 0, awakeUntil: 0,
    lastSeen: 0, greetOK: false, lastGreeted: undefined, lastRec: 0, lastSend: 0,
    rec: null, ptt: null, listening: false, mutedUntil: 0, waiting: false, lastSaid: '',
    cloudDead: false, cloudPause: 0,
    rc: null, frameAt: 0, decoding: false, camOn: false, watching: false,
    lastP: 0, lastAct: Date.now(), lastIdle: 0, lastBye: 0
  }).current;
  const A = useRef({});                                // latest copies of the functions below
  const videoRef = useRef(el => { x.video = el; }).current;   // created once, so React does not reset it
  const robotCanvasRef = useRef(el => { x.rc = el; }).current; // the picture from the robot camera is drawn here

  const msg = (cls, text, url) => setMessages(m => [...m.slice(-150), { cls, text, url }]);
  const log = text => msg('sys', text);
  const idleBadge = () => x.speaking ? 'Speaking' : x.thinking ? 'Thinking' : (x.listening || x.ptt) ? 'Listening' : 'Idle';
  const refreshBadge = () => setBadge(idleBadge());
  const lostLogin = e => { if (e instanceof AuthError) { onLoggedOut(); return true; } return false; };

  // ---------- robot link (through our server) ----------
  const send = s => {
    const w = x.ws, sync = live.current.S.sync;
    if (w && w.readyState === 1 && controlsRobot(sync)) w.send(s);     // the server also checks this
    if (showsFace(sync)) {                                             // the robot shown on the page copies these too
      if (s.startsWith('x:')) setFace(+s.slice(2));
      else if (s.startsWith('p:')) setHead(h => ({ ...h, pan: +s.slice(2) }));
      else if (s.startsWith('h:')) setHead(h => ({ ...h, tilt: +s.slice(2) }));
    }
  };

  function openWs() {
    if (x.ws) return;
    const w = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    x.ws = w;
    w.onopen = () => { x.watching = false; sendView(); sendSync(); sendListen(); };
    w.onmessage = e => {
      if (typeof e.data !== 'string') return drawFrame(e.data);          // a picture from the robot camera
      try {
        const j = JSON.parse(e.data);
        if ('esp' in j) { setRobot(!!j.esp); if (!j.esp) setMood(null); }
        if ('cam' in j) setRobotCam(!!j.cam);
        if (j.mood) { setMood(j.mood); if (showsFace(live.current.S.sync)) setFace(j.mood.expr); }   // the face on the page copies the robot
        if (j.heard && live.current.S.listenSource === 'robot') A.current.heard(j.heard);   // a sentence the robot's microphone heard
        if (j.ev && showsFace(live.current.S.sync) && eventText(j.ev)) log(eventText(j.ev));
      } catch (err) { /* ignore */ }
    };
    w.onclose = () => {
      x.ws = null; x.watching = false; setRobot(null); setRobotCam(false);
      if (!x.closing) x.timer = setTimeout(openWs, 3000);
    };
  }

  // Pictures from the ESP32-CAM: drawn on one canvas. The Camera page shows it and face recognition can read it.
  async function drawFrame(blob) {
    if (x.decoding || !x.rc) return;                   // still busy with the last picture: skip this one
    x.decoding = true;
    try {
      const bmp = await createImageBitmap(blob);
      const c = x.rc;
      if (c.width !== bmp.width || c.height !== bmp.height) { c.width = bmp.width; c.height = bmp.height; }
      c.getContext('2d').drawImage(bmp, 0, 0);
      bmp.close(); x.frameAt = Date.now();
    } catch (e) { /* broken picture, skip it */ }
    x.decoding = false;
  }
  function sendListen() {                             // the server tells the robot to send audio only while someone listens through it
    const w = x.ws;
    if (w && w.readyState === 1) w.send(x.listening && live.current.S.listenSource === 'robot' ? 'listen:robot' : 'listen:off');
  }
  function sendSync() {
    const w = x.ws;
    if (w && w.readyState === 1) w.send('sync:' + (live.current.S.sync || 'both'));
  }
  // tell the server whether we want pictures (the camera only sends while someone watches)
  function sendView() {
    const w = x.ws, s = live.current.S;
    const want = viewing || (x.camOn && s.faceSource === 'robot');
    if (!w || w.readyState !== 1 || want === x.watching) return;
    x.watching = want; w.send(want ? 'view:on' : 'view:off');
  }
  // what face recognition looks at: this computer's camera or the robot's camera
  const source = () => live.current.S.faceSource === 'robot' ? x.rc : x.video;
  const sourceReady = () => live.current.S.faceSource === 'robot' ? Date.now() - x.frameAt < 3000 : !!x.video && x.video.readyState >= 2;

  // ---------- saving ----------
  const commitMem = next => {
    setMem(next); live.current.mem = next;
    api('mem', 'PUT', { facts: next.facts, chat: next.chat }).catch(e => { if (!lostLogin(e)) log('Could not save memory: ' + e.message); });
  };
  const commitFaces = async next => {
    try { await api('faces', 'PUT', next); setFaces(next); live.current.faces = next; return true; }
    catch (e) { if (!lostLogin(e)) log('Could not save faces: ' + e.message); return false; }
  };

  // ---------- start / stop ----------
  useEffect(() => {
    x.closing = false; openWs();
    (async () => {
      try {
        const [m, f, s] = await Promise.all([api('mem'), api('faces'), api('status')]);
        setMem({ facts: [], chat: [], ...m }); setFaces(f); setInfo(s);
      } catch (e) { if (!lostLogin(e)) log('Could not load saved data: ' + e.message); }
    })();
    return () => {
      x.closing = true; clearTimeout(x.timer);
      if (x.ws) { x.ws.close(); x.ws = null; }
      stopCamera(); stopListening(); pttStop();
    };
  }, []);

  useEffect(() => {                                   // a new AI choice gets a fresh start
    x.cloudDead = false; x.cloudPause = 0;
    setAi(p => ({ ...p, cloudOff: '' }));
  }, [S.aiSource, S.aiMode, S.cloudModel, S.ol]);

  useEffect(() => { if (x.listening) stopListening(); }, [S.mode, S.mic, S.listenSource]);   // changing the voice mode turns the microphone off
  useEffect(() => { refreshBadge(); }, [listening, holding]);
  useEffect(() => {                                   // head follows the mouse
    if (S.lookAt !== 'mouse') return;
    const move = e => aim((e.clientX / innerWidth - 0.5) * 120);
    addEventListener('mousemove', move);
    return () => removeEventListener('mousemove', move);
  }, [S.lookAt]);
  useEffect(() => {                                   // something small and fun when it is quiet
    const t = setInterval(() => {
      const now = Date.now();
      if (!x.started || !live.current.S.idle || x.speaking || x.thinking || x.ptt) return;
      if (now - x.lastAct < 180000 || now - x.lastIdle < 120000) return;
      x.lastIdle = now;
      const a = idleAction(Math.random(), Math.random(), now - x.lastSeen < 180000);
      a.cmds.forEach(c => A.current.send(c));
      if (a.line) A.current.say(a.line, a.tag);
    }, 15000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {                                   // the choice is also told to the server, which holds back the commands
    sendSync();
    if (!showsFace(S.sync)) setFace(0);
  }, [S.sync]);
  useEffect(() => { sendView(); }, [viewing, started, cam.on, S.faceSource]);
  useEffect(() => { if (x.camOn) { stopCamera(); startCamera(); } }, [S.faceSource]);   // other camera chosen: restart

  // ---------- camera + faces ----------
  async function loadModels() {
    const f = window.faceapi;
    if (!f) throw new Error('face library not loaded');
    if (f.nets.faceRecognitionNet.isLoaded) return;
    // Use the graphics card when the browser has one; otherwise fall back to the plain CPU mode (slower, but works everywhere).
    if (!(await f.tf.setBackend('webgl').catch(() => false))) await f.tf.setBackend('cpu');
    await f.tf.ready();
    await Promise.all([f.nets.tinyFaceDetector.loadFromUri(MODELS), f.nets.faceLandmark68Net.loadFromUri(MODELS), f.nets.faceRecognitionNet.loadFromUri(MODELS)]);
  }

  async function startCamera() {
    try {
      setCam({ on: false, note: 'Starting camera...' });
      await loadModels();
      if (live.current.S.faceSource === 'robot') {
        x.camOn = true; setCam({ on: true, note: '' });
        runLoop();
        return;
      }
      const s = await navigator.mediaDevices.getUserMedia({ video: true });
      x.stream = s; x.camOn = true;
      const V = x.video; V.srcObject = s; await V.play().catch(() => {});
      setCam({ on: true, note: '' });
      runLoop();
    } catch (e) { x.camOn = false; setCam({ on: false, note: 'Camera unavailable' }); log('Camera unavailable: ' + e.message + ' (allow the camera, and use https)'); }
  }
  function stopCamera() {
    x.loop++;
    if (x.stream) x.stream.getTracks().forEach(t => t.stop());
    x.stream = null; x.camOn = false; if (x.video) x.video.srcObject = null;
    x.cur = undefined; setWho('-'); setCam({ on: false, note: 'Camera is off' });
  }

  // The head turns to an angle (not step by step), because the camera does not move with the head.
  function aim(angle) {
    const now = Date.now();
    if (Math.abs(angle - x.lastP) < 6 || now - x.lastSend < 250) return;
    x.lastSend = now; x.lastP = Math.round(angle);
    A.current.send('p:' + x.lastP);
  }

  function runLoop() {
    const id = ++x.loop;
    const tick = async () => {
      if (id !== x.loop) return;
      const V = source();
      try {
        if (V && sourceReady()) {
          const d = await window.faceapi.detectSingleFace(V, OPT());
          const now = Date.now(), { S: s } = live.current;
          if (d) {
            if (now - x.lastSeen > (+s.away || 2) * 60000) x.greetOK = true;   // away long enough: greet again
            x.lastSeen = now;
            const b = d.box, err = (b.x + b.width / 2) / (V.videoWidth || V.width) - 0.5;
            if (s.lookAt === 'face') aim(err * 2 * GAIN * SIGN);
            if (now - x.lastRec > 3000) { x.lastRec = now; await A.current.recognize(); }
          } else {
            if (s.lookAt === 'face' && x.lastP !== 0 && now - x.lastSeen > 6000) { x.lastP = 0; A.current.send('p:0'); }   // nobody there: look straight again
            if (x.cur !== undefined && now - x.lastRec > 8000) {
              if (x.cur && s.bye && now - x.lastBye > 60000) { x.lastBye = now; A.current.say(farewell(x.cur, new Date().getHours()), 'happy'); }
              x.cur = undefined; setWho('-');
            }
          }
        }
      } catch (e) { /* skip this picture */ }
      if (id === x.loop) requestAnimationFrame(tick);
    };
    tick();
  }

  async function recognize() {
    if (!sourceReady()) return;
    const f = await window.faceapi.detectSingleFace(source(), OPT()).withFaceLandmarks().withFaceDescriptor();
    if (!f) return;
    let best = null, bd = 0.5;
    for (const p of live.current.faces) {
      const d = window.faceapi.euclideanDistance(p.d, f.descriptor);
      if (d < bd) { bd = d; best = p.n; }
    }
    if (best === x.cur) return;
    x.cur = best; setWho(best || 'unknown');
    // Only people who were saved with "Learn face" are greeted. Unknown faces are never saved.
    if (best && live.current.S.greet && (x.greetOK || best !== x.lastGreeted)) {
      x.greetOK = false; x.lastGreeted = best;
      x.lastAct = Date.now();
      A.current.say(greeting(best, new Date().getHours()), 'happy');
    }
  }

  // The ONLY place a face is saved: the person presses "Learn face".
  async function learnFace() {
    if (!x.camOn) return alert('Press Connect first so the camera is on.');
    if (!sourceReady()) return alert('No picture from the camera yet.');
    const f = await window.faceapi.detectSingleFace(source(), OPT()).withFaceLandmarks().withFaceDescriptor();
    if (!f) return alert('No face visible. Look at the camera and try again.');
    const name = (prompt('Name for this face?') || '').trim().slice(0, 40);
    if (!name) return;
    const ok = await commitFaces([...live.current.faces, { n: name, d: Array.from(f.descriptor).map(v => +v.toFixed(3)) }]);
    if (ok) { x.cur = name; x.lastGreeted = name; setWho(name); A.current.say('Nice to meet you, ' + name, 'happy'); }
  }

  async function deletePerson(name) {
    if (!confirm('Permanently delete the face of "' + name + '"?')) return;
    if (await commitFaces(live.current.faces.filter(p => p.n !== name))) {
      if (x.cur === name) { x.cur = undefined; x.lastGreeted = undefined; setWho('-'); }
      log('Deleted face: ' + name);
    }
  }

  async function connect() {
    if (started) return;
    setStarted(true); x.started = true; x.lastAct = Date.now();
    try { speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch (e) { /* unlocks speech after a click */ }
    if (live.current.S.cam) await startCamera();
    else setCam({ on: false, note: 'Camera is off' });
    log('Ready: ' + live.current.faces.length + ' face samples, ' + live.current.mem.facts.length + ' memories');
    warmLocal(); refreshModels();
  }

  function setCamera(on) { if (!started) return; if (on) startCamera(); else stopCamera(); }

  // ---------- talking ----------
  function say(t, e = 'neutral', url) {
    const id = ++x.sayId, s = live.current.S;
    send('x:' + (EX[e] ?? 0)); msg('bot', t, url); x.lastSaid = norm(t);
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.rate = s.rate || 1;
    const v = speechSynthesis.getVoices().find(vv => vv.name === s.voice); if (v) u.voice = v;
    x.speaking = true; refreshBadge(); send('t:1');
    const lv = live.current;
    const done = () => {                              // can only run once per sentence, and never gets stuck
      if (id !== x.sayId) return;
      x.speaking = false; x.mutedUntil = Date.now() + 1500;   // short pause, so the microphone does not hear the end of its own voice
      if (x.waiting) { x.waiting = false; x.awakeUntil = Date.now() + 10000; }   // after "Yes?" the answer window starts now
      refreshBadge(); send('t:0');
      setTimeout(() => send('x:0'), 3000);
    };
    const laptop = () => {                            // the voice of this computer
      u.onend = done; u.onerror = done;
      setTimeout(done, 3000 + t.length * 90 / (s.rate || 1));
      speechSynthesis.speak(u);
    };
    const place = s.voicePlace || 'both';             // 'laptop' | 'robot' | 'both'
    if (place === 'laptop' || !lv.info.voice || !lv.robot || !controlsRobot(s.sync)) return laptop();
    // the robot's own speaker: the server makes the audio and streams it to the robot
    setTimeout(done, 25000);                          // never stays stuck if the server does not answer
    api('speak', 'POST', { text: t }).then(r => {
      if (id === x.sayId && place === 'robot') setTimeout(done, r.ms + 400);
    }).catch(e => {
      if (lostLogin(e)) return;
      if (id === x.sayId) log('Robot voice did not work (' + e.message + ')' + (place === 'robot' ? ', using this computer instead.' : '.'));
      if (id === x.sayId && place === 'robot') laptop();
    });
    if (place === 'both') laptop();
  }

  function openSite(o) {
    const w = window.open(o.url, '_blank');
    if (w) w.opener = null;
    say(o.say, 'happy', o.url);                       // the chat shows an "Open it" link as well
    if (!w) log('The browser blocked the new tab. Click "Open it" above, or allow pop-ups for this site.');
  }

  async function route(text) {
    msg('me', text); x.lastAct = Date.now();
    const o = openCommand(text);                      // checked first, so "play music on youtube" is not the robot's own song
    if (o) return openSite(o);
    const c = robotCommand(text);
    if (c) { send(c.cmd); if (c.say) say(c.say); return; }
    const t = smallTalk(text, x.cur, new Date().getHours());     // hello, bye, thanks and kind words are answered here, without the AI
    if (t) return say(t.say, t.tag);
    await ask(text);
  }

  async function ask(text) {
    const { S: s, mem: m } = live.current;
    const chat = [...m.chat, { role: 'user', content: ((x.cur ? x.cur + ': ' : '') + text).slice(0, 1500) }].slice(-12);
    send('x:7'); x.thinking = true; refreshBadge();
    try {
      const messages = [{ role: 'system', content: systemPrompt(x.cur, m.facts) }, ...chat];
      const raw = await askModel(s, messages);
      const r = parseReply(noThinking(raw));
      const next = { facts: [...m.facts, ...keepFacts(text, r.facts, m.facts)].slice(-50), chat: [...chat, { role: 'assistant', content: r.text.slice(0, 1500) }] };
      if (s.remember) commitMem(next); else { setMem({ facts: next.facts, chat: [] }); live.current.mem = { facts: next.facts, chat: [] }; }
      x.thinking = false; say(r.text, r.tag);
    } catch (e) {
      if (!lostLogin(e)) log('AI error: ' + e.message);
      send('x:2');
    } finally { x.thinking = false; refreshBadge(); }
  }

  // ---------- which AI answers ----------
  function cloudFailed(e) {
    // An error answer from Ollama (sign-in, limit, unknown model) will not fix itself, so the cloud stays off for this session.
    // A network problem or a slow answer may pass, so the cloud only rests for a while.
    if ((e.status && e.status < 500) || LIMIT_WORDS.test(e.message)) x.cloudDead = true;
    else x.cloudPause = Date.now() + CLOUD_PAUSE;
  }
  const cloudState = () => x.cloudDead ? 'session' : Date.now() < x.cloudPause ? 'pause' : '';

  async function askModel(s, messages) {
    if (s.aiSource !== 'local') return (await api('chat', 'POST', { messages })).message.content;
    const mode = s.aiMode || 'auto';
    if (mode === 'cloud') {
      const out = await ollamaChat(s.ol, s.cloudModel, messages, 60000);
      setAi(p => ({ ...p, active: 'cloud' }));
      return out;
    }
    if (mode === 'auto' && !x.cloudDead && Date.now() >= x.cloudPause) {
      try {
        const out = await ollamaChat(s.ol, s.cloudModel, messages, CLOUD_WAIT);
        setAi({ active: 'cloud', cloudOff: '' });
        return out;
      } catch (e) {
        cloudFailed(e);
        log('The cloud AI did not answer (' + e.message + '). Using ' + s.localModel + (x.cloudDead ? ' for the rest of this session.' : ' for now.'));
      }
    }
    const out = await ollamaChat(s.ol, s.localModel, messages, 120000, { think: false, keep_alive: '30m' });
    setAi({ active: 'local', cloudOff: mode === 'auto' ? cloudState() : '' });
    return out;
  }

  function retryCloud() {
    x.cloudDead = false; x.cloudPause = 0;
    setAi(p => ({ ...p, cloudOff: '' }));
    log('The cloud AI will be tried again.');
  }

  // Loads the local model into memory, so the first backup answer is not slow.
  async function warmLocal() {
    const s = live.current.S;
    if (s.aiSource !== 'local' || s.aiMode === 'cloud') return;
    try {
      const r = await fetch(s.ol.replace(/\/$/, '') + '/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(120000),
        body: JSON.stringify({ model: s.localModel, messages: [], keep_alive: '30m' })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
      log('Local AI ready: ' + s.localModel);
    } catch (e) { log('Local AI is not ready (' + s.localModel + '): ' + e.message); }
  }

  async function refreshModels() {
    const s = live.current.S;
    try {
      const r = await fetch(s.ol.replace(/\/$/, '') + '/api/tags', { signal: AbortSignal.timeout(5000) });
      const j = await r.json();
      const names = (j.models || []).map(m => m.name).sort();
      setModels(names);
      setModelNote(names.length + ' models found in Ollama.');
    } catch (e) { setModelNote('Could not read the list from Ollama: ' + e.message); }
  }

  // ---------- memory edits ----------
  const addFact = t => { if (t && t.trim()) commitMem({ ...live.current.mem, facts: [...live.current.mem.facts, t.trim().slice(0, 300)].slice(-50) }); };
  const deleteFact = i => commitMem({ ...live.current.mem, facts: live.current.mem.facts.filter((_, k) => k !== i) });
  const clearChat = () => commitMem({ ...live.current.mem, chat: [] });
  const clearAllMemory = () => { if (confirm('Clear all memory?')) commitMem({ facts: [], chat: [] }); };

  // ---------- voice: wake name / always listen / push-to-talk ----------
  const setListening = v => { x.listening = v; setListeningState(v); };

  function makeRec(continuous, onFinal) {
    const r = new SR();
    r.lang = 'en-US'; r.continuous = continuous; r.interimResults = false;
    r.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) { const t = e.results[i][0].transcript.trim(); if (t) onFinal(t); }
      }
    };
    r.onerror = e => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      const hint = e.error === 'not-allowed' ? ' (allow the microphone in Chrome)'
        : e.error === 'network' ? ' (voice needs Chrome or Edge and an internet connection; Brave blocks it)'
        : e.error === 'audio-capture' ? ' (no microphone found)' : '';
      log('Microphone error: ' + e.error + hint);
      // These errors do not fix themselves, so stop instead of restarting the microphone again and again.
      if (['not-allowed', 'service-not-allowed', 'network', 'audio-capture'].includes(e.error) && r === x.rec) { x.rec = null; setListening(false); }
    };
    return r;
  }

  function heard(text) {                              // used by wake-name and always-listen modes
    if (x.speaking || x.thinking || Date.now() < x.mutedUntil) return;   // do not hear the robot's own voice
    const heardText = norm(text);
    if (heardText.length >= 8 && x.lastSaid.includes(heardText)) return;   // that was the end of the robot's own sentence
    const s = live.current.S;
    if (s.mode === 'always') return route(text);
    const { woke, rest } = wakeSplit(text, wakeNames(s.wake));
    if (woke) {
      if (rest) return route(rest);                   // "Buddy, tell me a joke"
      x.waiting = true;                               // only the name: wait for the question
      return say('Yes?', 'surprised');
    }
    if (Date.now() < x.awakeUntil) { x.awakeUntil = 0; return route(text); }
    log('Ignored: ' + text);                          // shows what was heard, to help you pick a wake name
  }

  function startListening() {
    const r = makeRec(true, t => A.current.heard(t));
    r.onend = () => setTimeout(() => { if (x.rec === r && x.listening) { try { r.start(); } catch (e) { /* already running */ } } }, 300);
    x.rec = r; setListening(true);
    try { r.start(); } catch (e) { log('Could not start the microphone: ' + e.message); }
  }
  function stopListening() {
    const r = x.rec; x.rec = null; setListening(false); sendListen();
    if (r) { try { r.stop(); } catch (e) { /* ignore */ } }
  }

  function toggleListening() {                        // wake / always modes
    if (live.current.S.listenSource === 'robot') {    // the robot's microphone: no browser microphone is needed
      const { info: i, robot: r } = live.current;
      if (!i.ears) return log('The listening engine is off on the server.');
      if (!r) return log('The robot is offline, so its microphone cannot be used.');
      if (x.listening) { stopListening(); return; }
      setListening(true); sendListen();
      return log('Listening with the robot - say the wake name first' + (live.current.S.mode === 'always' ? '' : ' (' + live.current.S.wake + ')'));
    }
    if (!SR) return alert('Use Chrome');
    if (live.current.S.mode === 'push') return log('Push-to-talk mode: hold the microphone button or the Space key.');
    if (x.listening) stopListening(); else { startListening(); log('Listening - mode: ' + live.current.S.mode); }
  }

  function pttStart() {                               // push-to-talk: the microphone is on only while held
    const s = live.current.S;
    if (s.mode !== 'push' || s.listenSource === 'robot' || !s.mic || x.ptt) return;
    if (!SR) return alert('Use Chrome');
    speechSynthesis.cancel();
    const r = makeRec(false, t => A.current.route(t));
    r.onend = () => { x.ptt = null; setHolding(false); };
    x.ptt = r; setHolding(true);
    try { r.start(); } catch (e) { x.ptt = null; setHolding(false); }
  }
  function pttStop() { if (x.ptt) { try { x.ptt.stop(); } catch (e) { /* ignore */ } } }

  useEffect(() => {                                   // Space bar = push-to-talk
    const typing = e => /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
    const down = e => { if (e.code !== 'Space' || e.repeat || typing(e) || live.current.S.mode !== 'push') return; e.preventDefault(); A.current.pttStart(); };
    const up = e => { if (e.code !== 'Space' || typing(e) || live.current.S.mode !== 'push') return; e.preventDefault(); A.current.pttStop(); };
    addEventListener('keydown', down); addEventListener('keyup', up);
    return () => { removeEventListener('keydown', down); removeEventListener('keyup', up); };
  }, []);

  A.current = { send, say, route, heard, recognize, pttStart, pttStop };

  return {
    // state
    robot, robotCam, mood, face, head, badge, messages, who, cam, started, mem, faces, info, listening, holding, ai, models, modelNote,
    videoRef, robotCanvasRef, setViewing,
    // actions
    send, say, route, connect, setCamera, learnFace, deletePerson,
    toggleListening, pttStart, pttStop, addFact, deleteFact, clearChat, clearAllMemory, retryCloud, refreshModels
  };
}