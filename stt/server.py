# stt: turns what the robot's microphone heard into text (faster-whisper, runs offline inside this container)
# POST /listen  body = raw audio, 16 kHz, 16-bit, mono  ->  {"text": "..."}
# GET  /health  ->  200 when the model is loaded
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

MODEL = os.environ.get('MODEL', 'base.en')
MODEL_DIR = os.environ.get('MODEL_DIR', '/models')
PORT = int(os.environ.get('PORT', '5001'))
RATE = 16000
MAX_BYTES = RATE * 2 * 15       # 15 seconds is the longest sentence we accept
MIN_BYTES = RATE * 2 // 4       # shorter than a quarter second is only noise
MAX_NO_SPEECH = 0.6             # the model's own guess that a piece is not speech

model = None
lock = threading.Lock()         # one sentence at a time, the container is small


def listen(pcm):
    audio = np.frombuffer(pcm, dtype='<i2').astype(np.float32) / 32768.0
    with lock:
        segments, _ = model.transcribe(
            audio, language='en', beam_size=1, vad_filter=True, condition_on_previous_text=False
        )
        words = [s.text.strip() for s in segments if s.no_speech_prob < MAX_NO_SPEECH]
    return ' '.join(w for w in words if w)


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body=b'', ctype='text/plain'):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/health' and model is not None:
            return self._send(200, b'ok')
        self._send(404, b'not found')

    def do_POST(self):
        if self.path != '/listen':
            return self._send(404, b'not found')
        try:
            size = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            size = 0
        if size < MIN_BYTES or size > MAX_BYTES or size % 2:
            return self._send(400, b'bad audio size')
        pcm = self.rfile.read(size)
        try:
            text = listen(pcm)
        except Exception as e:  # the model failed on this audio
            print('listen failed:', e, flush=True)
            return self._send(500, b'listening failed')
        self._send(200, json.dumps({'text': text}).encode(), 'application/json')

    def log_message(self, *args):  # no access log, nothing that was heard is written down
        pass


def main():
    global model
    from faster_whisper import WhisperModel
    model = WhisperModel(MODEL, device='cpu', compute_type='int8', cpu_threads=2, download_root=MODEL_DIR)
    print('model ready:', MODEL, flush=True)
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()


if __name__ == '__main__':
    main()
