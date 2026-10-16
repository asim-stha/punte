import test from 'node:test';
import assert from 'node:assert/strict';
import { robotCommand, openCommand, wakeNames, wakeSplit, parseReply, systemPrompt, people } from '../src/lib/commands.js';

test('robot commands', () => {
  assert.deepEqual(robotCommand('please turn left'), { cmd: 'r:-45' });
  assert.deepEqual(robotCommand('Look right!'), { cmd: 'r:45' });
  assert.equal(robotCommand('spin around').cmd, 'r:360');
  assert.equal(robotCommand('I like spinach'), null);          // not the word "spin"
  assert.equal(robotCommand('stop the music').cmd, 'm:-1');
  assert.match(robotCommand('play a song').cmd, /^m:[012]$/);
  assert.equal(robotCommand('look up').cmd, 'h:18');
  assert.equal(robotCommand('head down please').cmd, 'h:-18');
  assert.equal(robotCommand('head level').cmd, 'h:0');
  assert.equal(robotCommand('beep').cmd, 'c:2');
  assert.equal(robotCommand('what is the weather'), null);
});

test('open websites', () => {
  assert.equal(openCommand('Open YouTube').url, 'https://www.youtube.com');
  assert.equal(openCommand('please open the github website').url, 'https://github.com');
  assert.equal(openCommand('open example.com').url, 'https://example.com');
  assert.equal(openCommand('open the door'), null);
  assert.equal(openCommand('open evil.com/login'), null);
  assert.equal(openCommand('play lofi beats on youtube').url, 'https://www.youtube.com/results?search_query=lofi%20beats');
  assert.match(openCommand('play music on YouTube.').url, /popular%20music%20mix/);
  assert.match(openCommand('open youtube and play despacito').url, /despacito/);
  assert.match(openCommand('search for cats on youtube').url, /search_query=cats$/);
  assert.equal(openCommand('google how tall is everest').url, 'https://www.google.com/search?q=how%20tall%20is%20everest');
  assert.equal(openCommand('play a song'), null);          // the robot's own song, not YouTube
  assert.equal(openCommand('what is youtube'), null);
  assert.equal(openCommand('yes play Mr Beast latest video').url, 'https://www.youtube.com/results?search_query=mr%20beast%20latest%20video');
  assert.equal(openCommand('please play despacito').url, 'https://www.youtube.com/results?search_query=despacito');
  assert.equal(openCommand('play some music'), null);
});

test('wake name', () => {
  assert.equal(wakeSplit('a budget plan', ['bud']).woke, false);   // whole word only
  assert.equal(wakeSplit('Punte, open youtube', ['punte']).rest, 'open youtube');
  assert.deepEqual(wakeNames('Buddy, Robo ,'), ['buddy', 'robo']);
  assert.deepEqual(wakeNames(''), ['punte']);
  assert.deepEqual(wakeSplit('Buddy, tell me a joke', ['buddy']), { woke: true, rest: 'tell me a joke' });
  assert.deepEqual(wakeSplit('hey BUDDY', ['buddy']), { woke: true, rest: '' });
  assert.deepEqual(wakeSplit('what is up', ['buddy']), { woke: false, rest: 'what is up' });
  assert.equal(wakeSplit('hi robo how are you', ['buddy', 'robo']).rest, 'how are you');
});

test('AI reply', () => {
  const r = parseReply('[happy] Nice to meet you, Sam!\nREMEMBER: Sam likes tea');
  assert.equal(r.text, 'Nice to meet you, Sam!'); assert.equal(r.tag, 'happy'); assert.deepEqual(r.facts, ['Sam likes tea']);
  assert.equal(parseReply('No tag here').tag, 'neutral');
  assert.equal(parseReply('[bogus] hi').tag, 'neutral');
  assert.equal(parseReply('[sad]').text, '...');
});

test('prompt and people', () => {
  assert.match(systemPrompt('Sam', []), /never say that you did/);
  assert.match(systemPrompt('Sam', ['likes tea']), /Person in front of you: Sam[\s\S]*- likes tea/);
  assert.match(systemPrompt(undefined, []), /unknown/);
  assert.deepEqual(people([{ n: 'A' }, { n: 'B' }, { n: 'A' }]), [{ name: 'A', samples: 2 }, { name: 'B', samples: 1 }]);
});