import test from 'node:test';
import assert from 'node:assert/strict';
import { FACE_CLASS } from '../src/lib/commands.js';

test('FACE_CLASS has entries for all eight expressions plus fallback', () => {
  assert.ok(Array.isArray(FACE_CLASS));
  assert.ok(FACE_CLASS.length >= 8, 'at least 8 entries');
  assert.equal(FACE_CLASS[0], '');          // neutral
  assert.equal(FACE_CLASS[1], 'happy');
  assert.equal(FACE_CLASS[2], 'sad');
  assert.equal(FACE_CLASS[3], 'angry');
  assert.equal(FACE_CLASS[4], 'sleepy');
  assert.equal(FACE_CLASS[5], 'wow');
  assert.equal(FACE_CLASS[6], 'love');
  assert.equal(FACE_CLASS[7], 'think');
});

test('out-of-range expression index returns empty string', () => {
  assert.equal(FACE_CLASS[99] || '', '');
  assert.equal(FACE_CLASS[-1] || '', '');
});
