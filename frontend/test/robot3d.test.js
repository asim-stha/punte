import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp, rad, approach, faceParams, sleepFactor, eyeOpenFor, armGesture, panRad, tiltRad } from '../src/lib/robot3d.js';

test('clamp keeps a value inside the range', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
});

test('rad turns degrees into radians', () => {
  assert.ok(Math.abs(rad(180) - Math.PI) < 1e-9);
  assert.equal(rad(0), 0);
});

test('approach moves toward the target without overshooting', () => {
  assert.equal(approach(0, 10, 0), 0);        // no step
  assert.equal(approach(0, 10, 1), 10);       // full step
  assert.equal(approach(0, 10, 0.5), 5);      // half way
  // repeated steps keep getting closer and never pass the target
  let v = 0;
  for (let i = 0; i < 50; i++) v = approach(v, 10, 0.2);
  assert.ok(v > 9.9 && v <= 10);
});

test('each expression has a face, with sensible mouths', () => {
  for (let n = 0; n <= 7; n++) assert.ok(faceParams(n), 'expression ' + n + ' has a face');
  assert.equal(faceParams(1).mouth, 'smile');       // happy
  assert.equal(faceParams(2).mouth, 'frown');       // sad
  assert.equal(faceParams(5).mouth, 'open');        // surprised
  assert.equal(faceParams(6).heart, true);          // love shows hearts
  assert.equal(faceParams(99).mouth, faceParams(0).mouth);   // unknown falls back to neutral
});

test('sleep state closes the eyes', () => {
  assert.equal(sleepFactor(0), 1);        // awake
  assert.ok(sleepFactor(1) < 1 && sleepFactor(1) > 0);   // drowsy: half closed
  assert.equal(sleepFactor(2), 0);        // asleep: shut
});

test('eye openness combines expression and sleep', () => {
  assert.equal(eyeOpenFor(1, 2), 0);              // asleep, eyes shut whatever the mood
  assert.ok(eyeOpenFor(5, 0) >= 1);               // surprised, wide awake
  assert.ok(eyeOpenFor(4, 0) < 0.3);              // sleepy expression, nearly shut
  assert.ok(eyeOpenFor(0, undefined) > 0.5);      // no robot state given: treated as awake
});

test('arms match the expression', () => {
  assert.equal(armGesture(5), 'up');      // surprised
  assert.equal(armGesture(1), 'wave');    // happy
  assert.equal(armGesture(6), 'wave');    // love
  assert.equal(armGesture(3), 'down');    // angry
  assert.equal(armGesture(0), 'rest');    // neutral
});

test('head angles stay inside a safe range', () => {
  assert.ok(Math.abs(panRad(1000)) <= rad(70) + 1e-9);     // clamped left/right
  assert.ok(Math.abs(panRad(-1000)) <= rad(70) + 1e-9);
  assert.ok(Math.abs(tiltRad(1000)) <= rad(25) + 1e-9);    // clamped up/down
  assert.equal(panRad(0), 0);
});
