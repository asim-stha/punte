// Small pure helpers (no React), so they are easy to test.

export const EX = { neutral: 0, happy: 1, sad: 2, angry: 3, sleepy: 4, surprised: 5, love: 6, think: 7 };
export const NAMES = ['Neutral', 'Happy', 'Sad', 'Angry', 'Sleepy', 'Surprised', 'Love', 'Think'];
export const FACE_CLASS = ['', 'happy', 'sad', 'angry', 'sleepy', 'wow', 'love', 'think', 'happy'];

// Spoken or typed words that control the robot directly (no AI needed).
export function robotCommand(text) {
  const s = text.toLowerCase();
  if (/stop (the )?(music|song)/.test(s)) return { cmd: 'm:-1', say: 'Stopped.' };
  if (/play.*(music|song)/.test(s)) return { cmd: 'm:' + Math.floor(Math.random() * 3) };
  if (/(turn|rotate|look) left/.test(s)) return { cmd: 'r:-45' };
  if (/(turn|rotate|look) right/.test(s)) return { cmd: 'r:45' };
  if (/\bspin\b|\b360\b/.test(s)) return { cmd: 'r:360' };
  if (/face front|look front/.test(s)) return { cmd: 'p:0' };
  if (/\b(?:look|head|tilt) up\b/.test(s)) return { cmd: 'h:18' };
  if (/\b(?:look|head|tilt) down\b/.test(s)) return { cmd: 'h:-18' };
  if (/\b(?:head|look) (?:level|straight)\b/.test(s)) return { cmd: 'h:0' };
  if (/\b(?:beep|chirp)\b/.test(s)) return { cmd: 'c:2' };
  return null;
}

const SITES = {
  youtube: 'https://www.youtube.com', google: 'https://www.google.com', gmail: 'https://mail.google.com',
  maps: 'https://maps.google.com', 'google maps': 'https://maps.google.com', translate: 'https://translate.google.com',
  github: 'https://github.com', wikipedia: 'https://www.wikipedia.org', naver: 'https://www.naver.com',
  facebook: 'https://www.facebook.com', instagram: 'https://www.instagram.com'
};

const GENERIC = /^(?:some |any |a |the )?(?:music|songs?|something)$/;
const youtube = q => ({
  url: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(GENERIC.test(q) ? 'popular music mix' : q),
  say: GENERIC.test(q) ? 'Opening music on YouTube.' : 'Searching YouTube for ' + q + '.'
});

// Words that open a website or search: "open youtube", "play lofi on youtube", "play mr beast latest video", "google cats".
// Gives back { url, say } or null. It runs before robotCommand, so "play music on youtube" does not start the robot's own song.
export function openCommand(text) {
  const s = text.toLowerCase().replace(/[!?,]+/g, ' ').replace(/\.+(\s|$)/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^(?:(?:yes|yeah|ok|okay|please|hey|hi)\s+)+/, '');    // the recognizer often keeps a "yes" or "please" at the start
  const yt = s.match(/\bplay (.+?) (?:on|in|from) youtube\b/) ||
    s.match(/\bsearch (?:for )?(.+?) (?:on|in) youtube\b/) ||
    s.match(/\b(?:youtube|open youtube (?:and )?) ?(?:play|search) (?:for )?(.+)/);
  if (yt) return youtube(yt[1].replace(/^(?:for|me)\s+/, ''));
  const p = s.match(/^play (?:me )?(.+)/);                 // "play despacito" -> YouTube; "play a song" stays the robot's own tune
  if (p && !GENERIC.test(p[1])) return youtube(p[1]);
  const g = s.match(/^(?:google|search(?: google)?(?: for)?) (.+)/);
  if (g) return { url: 'https://www.google.com/search?q=' + encodeURIComponent(g[1]), say: 'Searching Google for ' + g[1] + '.' };
  const o = s.match(/^(?:open|go to|launch) (?:the )?(.+?)(?: (?:website|site|page|app))?$/);
  if (o) {
    const name = o[1];
    if (SITES[name]) return { url: SITES[name], say: 'Opening ' + name + '.' };
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|dev|kr|np|edu)$/.test(name)) return { url: 'https://' + name, say: 'Opening ' + name + '.' };
  }
  return null;
}

// "buddy, robo" -> ['buddy', 'robo']
export const wakeNames = str => String(str || 'punte').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);

// "Buddy, tell me a joke" -> { woke: true, rest: 'tell me a joke' }
// The name must be a whole word, so the name "bud" does not wake on "budget".
export function wakeSplit(text, names) {
  for (const n of names) {
    const m = new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').exec(text);
    if (m) return { woke: true, rest: text.slice(m.index + m[0].length).replace(/^[\s,.!?]+/, '') };
  }
  return { woke: false, rest: text };
}

export function systemPrompt(who, facts) {
  return 'You are Punte, a small friendly desk robot with an OLED face. Reply in 1-2 short sentences. ' +
    'Start the reply with one tag: [neutral], [happy], [sad], [angry], [sleepy], [surprised], [love] or [think]. ' +
    'You cannot open websites, play videos or search the internet yourself, so never say that you did. ' +
    'If something is worth remembering about the user, add a final line "REMEMBER: <fact>". ' +
    `Person in front of you: ${who || 'unknown'}.\nKnown facts:\n- ${facts.join('\n- ')}`;
}

// Splits the AI answer into the spoken text, the face tag and the new facts.
export function parseReply(raw) {
  const facts = [];
  let a = String(raw).replace(/REMEMBER:(.*)/g, (_, f) => { if (f.trim()) facts.push(f.trim().slice(0, 300)); return ''; }).trim();
  const m = a.match(/^\s*\[(\w+)\]/);
  const tag = m && m[1].toLowerCase() in EX ? m[1].toLowerCase() : 'neutral';
  a = a.replace(/^\s*\[\w+\]\s*/, '');
  return { text: a || '...', tag, facts };
}

// Small models add a "REMEMBER:" line to almost every answer. A fact is kept only when the person
// really told Punte something about themselves, and at most one fact is kept per answer.
const ASKING = /^\s*(what|who|where|when|why|how|which|do|does|did|can|could|is|are|will|would)\b/i;
const ABOUT_SELF = /\b(i am|i'm|im|i like|i love|i hate|i live|i work|i study|i was born|i have a|call me|my name|my favou?rite|remember)\b/i;
const CHAT_NOTE = /\b(asked|said|wanted|requested|greeted|started|ate|bought|just now|this conversation)\b/i;
const flat = s => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export function keepFacts(userText, facts, known = []) {
  const text = String(userText || '');
  const seen = new Set(known.map(flat));
  const out = [];
  const add = f => {
    const k = flat(f);
    if (k && !seen.has(k) && !out.length) { seen.add(k); out.push(f); }
  };
  if (ASKING.test(text)) return out;
  const repeated = facts.some(f => seen.has(flat(f)));
  const aboutSelf = ABOUT_SELF.test(text.replace(/\b(like|as if|as though) i(?: am|'m)\b/gi, ''));   // "like I am 10" is not a fact
  if (aboutSelf) for (const f of facts) if (!CHAT_NOTE.test(f)) add(f);
  if (!out.length && !repeated) {                                   // "remember that ..." is saved even if the model forgot the REMEMBER line
    const m = text.match(/\bremember(?: that)?\s+(.{3,200})/i);
    if (m) {
      const f = m[1].trim().replace(/[.!?]+$/, '').replace(/\bmy\b/gi, 'their').replace(/\bi(?: am|'m)\b/gi, 'they are');
      add(f.charAt(0).toUpperCase() + f.slice(1));
    }
  }
  return out;
}

// Names of saved people, each once, with how many samples they have.
export function people(faces) {
  const map = new Map();
  for (const f of faces) map.set(f.n, (map.get(f.n) || 0) + 1);
  return [...map].map(([name, samples]) => ({ name, samples }));
}