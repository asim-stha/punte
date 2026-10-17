import test from 'node:test';
import assert from 'node:assert/strict';
import { robotCommand, openCommand, wakeNames, wakeSplit, parseReply, systemPrompt, people, greeting, farewell, smallTalk, idleAction, controlsRobot, showsFace, eventText, SYNC_OPTIONS } from '../src/lib/commands.js';

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
test('greeting and goodbye follow the time of day', () => {
  assert.equal(greeting('Sam', 8), 'Good morning, Sam!');
  assert.equal(greeting('Sam', 14), 'Good afternoon, Sam!');
  assert.equal(greeting(undefined, 19), 'Good evening!');
  assert.match(greeting('Sam', 2), /up late/);
  assert.match(farewell('Sam', 10), /Bye, Sam, have a nice day/);
  assert.match(farewell('Sam', 19), /good evening/);
  assert.match(farewell('Sam', 23), /Good night, Sam/);
});

test('small talk is answered without the AI', () => {
  assert.equal(smallTalk('hello', 'Sam', 9).say, 'Good morning, Sam!');
  assert.equal(smallTalk('Thanks!', null, 9).say, "You're welcome!");
  assert.match(smallTalk('good night', 'Sam', 23).say, /Good night, Sam/);
  assert.equal(smallTalk('good night', 'Sam', 23).tag, 'sleepy');
  assert.match(smallTalk('bye bye', null, 10).say, /have a nice day/);
  assert.match(smallTalk('how are you?', null, 10).say, /doing great/);
  assert.equal(smallTalk("I'm so tired today", null, 10).tag, 'sad');
  assert.match(smallTalk('i feel really stressed', null, 10).say, /deep breath/);
  assert.match(smallTalk('I had a terrible day', null, 10).say, /sorry today was hard/);
  assert.match(smallTalk("i'm lonely", null, 10).say, /someone you trust/);
});

test('small talk does not fire on other sentences', () => {
  assert.equal(smallTalk("I'm not sad", null, 10), null);
  assert.equal(smallTalk('am i sad', null, 10), null);
  assert.equal(smallTalk('hello can you tell me about the history of korea', null, 10), null);
  assert.equal(smallTalk('thanks for the help with my homework today', null, 10), null);
  assert.equal(smallTalk('what is the weather', null, 10), null);
  assert.equal(smallTalk('', null, 10), null);
});

test('idle actions use only commands the server accepts', () => {
  const ok = /^[xtnrpmlhuc]:-?\d{1,4}(\.\d{1,2})?$/;
  for (let i = 0; i < 20; i++) {
    const a = idleAction(i / 20, ((i * 7) % 20) / 20, i % 2 === 0);
    assert.ok(a.cmds.length > 0 && a.cmds.every(c => ok.test(c)));
    assert.equal(!!a.line, i % 2 === 0);             // a line is spoken only when someone is near
  }
  assert.ok(idleAction(0.999, 0.999, true).line);    // top of the range does not run off the list
});

test('sync choices', () => {
  assert.deepEqual(SYNC_OPTIONS.map(o => o[0]), ['both', 'web', 'robot', 'none']);
  assert.deepEqual(['both', 'web', 'robot', 'none'].map(controlsRobot), [true, false, true, false]);
  assert.deepEqual(['both', 'web', 'robot', 'none'].map(showsFace), [true, true, false, false]);
  assert.equal(eventText('touch'), 'Someone touched Punte');
  assert.equal(eventText('something-else'), '');
});
