# tts: turns text into speech for the robot's speaker (Piper, runs offline inside this container)
# POST /speak {"text": "..."}  ->  raw audio, 16 kHz, 16-bit, mono (what the robot's speaker expects)
# GET  /health                 ->  200 when the voice is loaded
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
from piper import PiperVoice

VOICE = os.environ.get('VOICE', 'en_US-lessac-medium')
VOICE_DIR = os.environ.get('VOICE_DIR', '/voices')
PORT = int(os.environ.get('PORT', '5000'))
RATE = 16000            # the robot plays 16 kHz
MAX_TEXT = 400          # characters per request
PAUSE = 0.12            # seconds of quiet between sentences

voice = None
lock = threading.Lock()  # one sentence is made at a time, the container is small


def to_rate(chunk):
    """One sentence from Piper as floats at 16 kHz."""
    audio = np.asarray(chunk.audio_float_array, dtype=np.float32)
    if chunk.sample_rate != RATE and len(audio) > 1:
        n = int(len(audio) * RATE / chunk.sample_rate)
        audio = np.interp(np.linspace(0, len(audio) - 1, n), np.arange(len(audio)), audio)
    return audio


def speak(text):
    parts = []
    with lock:
        for chunk in voice.synthesize(text):
            parts.append(to_rate(chunk))
            parts.append(np.zeros(int(RATE * PAUSE), dtype=np.float32))
    if not parts:
        return b''
    audio = np.clip(np.concatenate(parts), -1.0, 1.0)
    return (audio * 32767).astype('<i2').tobytes()


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body=b'', ctype='text/plain', extra=None):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/health' and voice is not None:
            return self._send(200, b'ok')
        self._send(404, b'not found')

    def do_POST(self):
        if self.path != '/speak':
            return self._send(404, b'not found')
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size <= 0 or size > 4096:
                return self._send(400, b'bad size')
            text = json.loads(self.rfile.read(size)).get('text')
        except (ValueError, AttributeError):
            return self._send(400, b'bad json')
        if not isinstance(text, str) or not text.strip():
            return self._send(400, b'text needed')
        try:
            pcm = speak(text.strip()[:MAX_TEXT])
        except Exception as e:  # the voice failed on this text
            print('speak failed:', e, flush=True)
            return self._send(500, b'speech failed')
        self._send(200, pcm, 'application/octet-stream', {'X-Sample-Rate': str(RATE)})

    def log_message(self, *args):  # no access log, texts stay private
        pass


def main():
    global voice
    voice = PiperVoice.load(os.path.join(VOICE_DIR, VOICE + '.onnx'))
    print('voice ready:', VOICE, flush=True)
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()


if __name__ == '__main__':
    main()
