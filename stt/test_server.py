# tests the web part of the stt container with a fake model (the real model is downloaded when the image is built)
import json
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from types import SimpleNamespace

import numpy as np

import server


class FakeModel:
    def __init__(self):
        self.heard = []

    def transcribe(self, audio, **options):
        self.heard.append((len(audio), options))
        pieces = [SimpleNamespace(text=' hello robot ', no_speech_prob=0.1),
                  SimpleNamespace(text=' (noise) ', no_speech_prob=0.9),
                  SimpleNamespace(text=' how are you', no_speech_prob=0.2)]
        return iter(pieces), None


def audio(seconds):
    return (np.zeros(int(16000 * seconds), dtype='<i2')).tobytes()


class SttTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fake = FakeModel()
        server.model = cls.fake
        cls.http = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        cls.base = 'http://127.0.0.1:%d' % cls.http.server_address[1]
        threading.Thread(target=cls.http.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()

    def post(self, body):
        req = urllib.request.Request(self.base + '/listen', data=body, method='POST')
        try:
            return urllib.request.urlopen(req)
        except urllib.error.HTTPError as e:
            return e

    def test_health(self):
        self.assertEqual(urllib.request.urlopen(self.base + '/health').status, 200)

    def test_text_comes_back_and_noise_pieces_are_dropped(self):
        r = self.post(audio(2))
        self.assertEqual(r.status, 200)
        self.assertEqual(json.loads(r.read()), {'text': 'hello robot how are you'})
        length, options = self.fake.heard[-1]
        self.assertEqual(length, 32000)
        self.assertEqual(options['language'], 'en')
        self.assertTrue(options['vad_filter'])

    def test_bad_audio_is_refused(self):
        self.assertEqual(self.post(b'').code, 400)
        self.assertEqual(self.post(audio(0.1)).code, 400)       # too short
        self.assertEqual(self.post(audio(16)).code, 400)        # too long
        self.assertEqual(self.post(audio(1) + b'x').code, 400)  # not whole samples

    def test_model_failure_is_an_error_not_a_crash(self):
        real = self.fake.transcribe
        self.fake.transcribe = lambda *a, **k: (_ for _ in ()).throw(RuntimeError('broken'))
        try:
            self.assertEqual(self.post(audio(1)).code, 500)
        finally:
            self.fake.transcribe = real
        self.assertEqual(self.post(audio(1)).status, 200)


if __name__ == '__main__':
    unittest.main()
