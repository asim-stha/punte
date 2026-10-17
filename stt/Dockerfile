# stt: the robot's ears. faster-whisper turns speech into text offline, no cloud account needed.
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY requirements.txt ./
RUN pip install -r requirements.txt

# the model is downloaded once while the image is built (about 150 MB), so the container needs no internet when it runs
ARG MODEL=base.en
ENV MODEL=${MODEL} MODEL_DIR=/models
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('${MODEL}', device='cpu', compute_type='int8', download_root='/models')" \
 && chmod -R a+rX /models
ENV HF_HUB_OFFLINE=1

COPY server.py ./
RUN useradd --system --no-create-home app
USER app
EXPOSE 5001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5001/health', timeout=3)" || exit 1
CMD ["python", "server.py"]
