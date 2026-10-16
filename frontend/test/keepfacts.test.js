import test from 'node:test';
import assert from 'node:assert/strict';
import { keepFacts } from '../src/lib/commands.js';

test('keeps a real fact about the person', () => {
  assert.deepEqual(keepFacts('Remember that my favorite food is pizza.', ['Your favorite food is pizza.']), ['Your favorite food is pizza.']);
  assert.deepEqual(keepFacts('Hi, I am Bhotee and I study IoT.', ['The user is Bhotee and studies IoT.']), ['The user is Bhotee and studies IoT.']);
});

test('saves "remember that" even when the model forgot the REMEMBER line', () => {
  assert.deepEqual(keepFacts('Remember that my favorite food is pizza.', []), ['Their favorite food is pizza']);
  assert.deepEqual(keepFacts('Please remember I am afraid of dogs', []), ['They are afraid of dogs']);
});

test('drops notes about the chat itself', () => {
  assert.deepEqual(keepFacts('Tell me a short joke.', ['The person asked for a joke.']), []);
  assert.deepEqual(keepFacts('Explain what the internet is, like I am 10 years old.', ['You asked about the internet.']), []);
  assert.deepEqual(keepFacts('I have 3 apples, I eat 1 and buy 4 more. How many do I have?', ['You started with 3 apples and ate 1.']), []);
  assert.deepEqual(keepFacts('I failed my exam today and I feel bad.', ['Everyone makes mistakes, it is how we learn.']), []);
  assert.deepEqual(keepFacts('Look left and then play some music.', ['The user asked me to look left.']), []);
});

test('questions never save a fact', () => {
  assert.deepEqual(keepFacts('What is my favorite food?', ['Your favorite food is pizza.']), []);
  assert.deepEqual(keepFacts('Do you remember me?', ['The user wants to be remembered.']), []);
});

test('keeps one fact per answer and skips repeats', () => {
  assert.deepEqual(keepFacts('I live in Gwangju and I like robots', ['The user lives in Gwangju.', 'The user likes robots.']), ['The user lives in Gwangju.']);
  assert.deepEqual(keepFacts('Remember that my favorite food is pizza.', ['Your favorite food is pizza.'], ['your favorite food is pizza']), []);
});
