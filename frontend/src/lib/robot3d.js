// Pure helpers for the 3D robot on the website. No three.js here, so these are easy to test.
// The 3D robot reads the same expression number and robot state that the OLED face uses.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const rad = deg => (deg * Math.PI) / 180;

// Moves a value a step closer to its target. k is 0..1 (how much of the gap to close this frame).
// With a sensible k this never overshoots, so the motion always looks smooth.
export const approach = (cur, target, k) => cur + (target - cur) * clamp(k, 0, 1);

// How each expression should look on the robot's face screen.
//   eyeOpen: 0 closed .. 1 wide          eyeCurve: -1 sad arc .. +1 happy arc
//   heart:   draw hearts instead of eyes brow:    -1 lowered (angry) .. +1 raised (surprised)
//   mouth:   'flat' | 'smile' | 'frown' | 'open'  mouthOpen: how far an open mouth opens
//   look:    where the eyes glance, -1 left .. +1 right, and up for 'think'
const FACE = {
  0: { eyeOpen: 1.0, eyeCurve: 0.0, heart: false, brow: 0.0, mouth: 'flat', mouthOpen: 0.15, look: 0, lookUp: 0 },   // neutral
  1: { eyeOpen: 0.9, eyeCurve: 1.0, heart: false, brow: 0.2, mouth: 'smile', mouthOpen: 0.2, look: 0, lookUp: 0 },   // happy
  2: { eyeOpen: 0.8, eyeCurve: -0.6, heart: false, brow: -0.2, mouth: 'frown', mouthOpen: 0.15, look: 0, lookUp: -0.3 }, // sad
  3: { eyeOpen: 0.7, eyeCurve: 0.0, heart: false, brow: -1.0, mouth: 'frown', mouthOpen: 0.1, look: 0, lookUp: 0 },  // angry
  4: { eyeOpen: 0.12, eyeCurve: 0.0, heart: false, brow: 0.0, mouth: 'flat', mouthOpen: 0.1, look: 0, lookUp: -0.2 }, // sleepy
  5: { eyeOpen: 1.3, eyeCurve: 0.0, heart: false, brow: 1.0, mouth: 'open', mouthOpen: 0.75, look: 0, lookUp: 0 },   // surprised
  6: { eyeOpen: 1.0, eyeCurve: 0.5, heart: true, brow: 0.2, mouth: 'smile', mouthOpen: 0.2, look: 0, lookUp: 0 },    // love
  7: { eyeOpen: 0.8, eyeCurve: 0.0, heart: false, brow: 0.3, mouth: 'flat', mouthOpen: 0.1, look: 0.5, lookUp: 0.4 } // think
};
export const faceParams = n => FACE[n] || FACE[0];

// How sleepy the robot looks. state comes from the real robot: 0 awake, 1 drowsy, 2 asleep.
export const sleepFactor = state => (state >= 2 ? 0 : state === 1 ? 0.45 : 1);

// Final eye openness, after the expression and the sleep state are both taken into account.
export const eyeOpenFor = (n, state) => clamp(faceParams(n).eyeOpen * sleepFactor(state), 0, 1.3);

// What the arms do for an expression: a quick wave when happy, both arms up when surprised,
// arms held low when angry, and a gentle resting sway the rest of the time.
export const armGesture = n => {
  if (n === 5) return 'up';
  if (n === 1 || n === 6) return 'wave';
  if (n === 3) return 'down';
  return 'rest';
};

// Turns a '-30' style head angle into radians, kept inside a safe range so the neck never looks broken.
export const panRad = deg => rad(clamp(deg, -70, 70));
export const tiltRad = deg => rad(clamp(deg, -25, 25));
