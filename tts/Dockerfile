# tts: the robot's voice. Piper turns text into speech offline, no cloud account needed.
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY requirements.txt ./
RUN pip install -r requirements.txt

# the voice is downloaded once while the image is built (about 60 MB), so the container needs no internet when it runs
ARG VOICE=en_US-lessac-medium
ENV VOICE=${VOICE} VOICE_DIR=/voices
RUN python -m piper.download_voices ${VOICE} --download-dir /voices

COPY server.py ./
RUN useradd --system --no-create-home app
USER app
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/health', timeout=3)" || exit 1
CMD ["python", "server.py"]
