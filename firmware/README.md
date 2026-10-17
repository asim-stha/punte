# firmware

ESP32 code for the robot body, in `desktop_body/desktop_body.ino`.

1. Copy `secrets.h.example` to `secrets.h` (same folder) and fill in the WiFi (2.4 GHz), the cloud address and the token. The token must be the same as `ESP_TOKEN` in `docker/.env`.
2. Arduino IDE: board "ESP32 Dev Module", partition scheme "Minimal SPIFFS (1.9MB APP with OTA)".
3. Libraries: WebSockets (Markus Sattler), Adafruit SSD1306, Adafruit GFX, DHT sensor library (Adafruit).
4. Upload the sketch.

### The robot's voice

The server makes the voice with the `tts` container (Piper) and sends it to the robot as 16 kHz audio, a little at a time. The robot plays it on its speaker, so no change to the sketch is needed. Settings has "Where Punte talks": robot speaker, this computer, or both.

### Mood on the website

The robot tells the server when its face or its awake, drowsy or asleep state changes (`mood:<face>:<state>`), and when something happens (`ev:touch`, `ev:near`, and so on). The website shows this on the Home page and in the chat log. In Settings, "Robot and website" chooses what is shared: both, website only, robot only, or neither. After changing `desktop_body.ino`, upload it again.

## Camera (ESP32-CAM)

Code is in `esp32_cam/esp32_cam.ino`. It is for the AI-Thinker ESP32-CAM sitting on the ESP32-CAM-MB base board.

1. Put `CAM_TOKEN=` with a 16+ character secret in `docker/.env` on the server (not the same as `ESP_TOKEN`), then run `bash infra/deploy.sh`. The server restarts with the camera turned on.
2. Copy `esp32_cam/secrets.h.example` to `esp32_cam/secrets.h` and fill in the WiFi (2.4 GHz), the cloud address and the same `CAM_TOKEN`.
3. Arduino IDE: board "AI Thinker ESP32-CAM", partition scheme "Huge APP (3MB No OTA/1MB SPIFFS)". Library: WebSockets (Markus Sattler).
4. Plug the ESP32-CAM-MB into the computer with a data USB cable and upload. The MB board puts the camera into upload mode by itself, so no wire to GND is needed. If the upload says "Wrong boot mode", hold the IO0 button on the MB board, tap RST, release IO0, and try again.
5. Open the Serial Monitor at 115200. You should see "connected to the server". On the website, open the Camera page and the camera starts sending pictures.

### On the robot body

- Power the camera board from its own 5 V supply that can give at least 1 A (the USB port of the MB board, or a small 5 V converter from the battery). Do not power it from the 3.3 V pin of the robot ESP32. When the camera sends pictures it takes short bursts of current, and a weak supply makes it reset by itself.
- The camera and the robot do not need a wire between them, they both talk to the server. If they share one battery, connect the grounds together.
- Use a short USB cable. Long thin cables drop voltage.
- If the picture is upside down, set `FLIP_PICTURE` to 1. If it is mirrored, set `MIRROR_PICTURE` to 1.
- The camera gets warm after a long time. Leave some air around it.
