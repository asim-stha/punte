# firmware

ESP32 code for the robot body, in `desktop_body/desktop_body.ino`.

1. Copy `secrets.h.example` to `secrets.h` (same folder) and fill in the WiFi (2.4 GHz), the cloud address and the token. The token must be the same as `ESP_TOKEN` in `docker/.env`.
2. Arduino IDE: board "ESP32 Dev Module", partition scheme "Minimal SPIFFS (1.9MB APP with OTA)".
3. Libraries: WebSockets (Markus Sattler), Adafruit SSD1306, Adafruit GFX, DHT sensor library (Adafruit).
4. Upload the sketch.
