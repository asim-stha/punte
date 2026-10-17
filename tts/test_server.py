# tests the web part of the tts container with a fake voice (the real voice model is downloaded when the image is built)
import json
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from types import SimpleNamespace

import numpy as np

import server


class FakeVoice:
    def synthesize(self, text):
        if 'boom' in text:
            raise RuntimeError('broken')
        # two "sentences" at 22050 Hz, 0.5 second each
        for _ in range(2):
            yield SimpleNamespace(sample_rate=22050, audio_float_array=np.full(11025, 0.25, dtype=np.float32))


class TtsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.voice = FakeVoice()
        cls.http = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        cls.base = 'http://127.0.0.1:%d' % cls.http.server_address[1]
        threading.Thread(target=cls.http.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()

    def post(self, body, raw=False):
        data = body if raw else json.dumps(body).encode()
        req = urllib.request.Request(self.base + '/speak', data=data, method='POST')
        try:
            return urllib.request.urlopen(req)
        except urllib.error.HTTPError as e:
            return e

    def test_health(self):
        self.assertEqual(urllib.request.urlopen(self.base + '/health').status, 200)

    def test_speak_gives_16khz_audio(self):
        r = self.post({'text': 'Hello there. How are you?'})
        self.assertEqual(r.status, 200)
        self.assertEqual(r.headers['X-Sample-Rate'], '16000')
        pcm = r.read()
        # 2 x (0.5 s speech + 0.12 s pause) at 16 kHz, 2 bytes per sample
        self.assertEqual(len(pcm), 2 * (8000 + int(16000 * 0.12)) * 2)
        samples = np.frombuffer(pcm, dtype='<i2')
        self.assertTrue(abs(int(samples[100]) - int(0.25 * 32767)) < 5)

    def test_bad_requests(self):
        self.assertEqual(self.post({'text': ''}).code, 400)
        self.assertEqual(self.post({'text': 5}).code, 400)
        self.assertEqual(self.post({}).code, 400)
        self.assertEqual(self.post(b'not json', raw=True).code, 400)
        self.assertEqual(self.post({'text': 'x' * 5000}).code, 400)   # bigger than the request limit

    def test_voice_failure_is_an_error_not_a_crash(self):
        self.assertEqual(self.post({'text': 'boom'}).code, 500)
        self.assertEqual(self.post({'text': 'fine again'}).status, 200)

    def test_long_text_is_cut(self):
        seen = []
        real = server.voice.synthesize
        server.voice.synthesize = lambda t: (seen.append(len(t)), real(t))[1]
        try:
            self.assertEqual(self.post({'text': 'a' * 1000}).status, 200)
        finally:
            server.voice.synthesize = real
        self.assertEqual(seen, [server.MAX_TEXT])


if __name__ == '__main__':
    unittest.main()
