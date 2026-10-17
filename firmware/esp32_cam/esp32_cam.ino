// Punte camera - AI-Thinker ESP32-CAM (Arduino core 3.x)
// Sends pictures to our server over a secure websocket. The server shows them on the website
// and only asks for pictures while someone is looking at them.
// Libs: WebSockets (Markus Sattler)
// Board: "AI Thinker ESP32-CAM", partition scheme: Huge APP (3MB No OTA)
#include <WiFi.h>
#include <WebSocketsClient.h>
#include "esp_camera.h"
#include "secrets.h"   // WIFI_SSID, WIFI_PASS, CLOUD_HOST, CAM_TOKEN

// ---------- AI-Thinker pins ----------
#define PWDN_GPIO_NUM   32
#define RESET_GPIO_NUM  -1
#define XCLK_GPIO_NUM    0
#define SIOD_GPIO_NUM   26
#define SIOC_GPIO_NUM   27
#define Y9_GPIO_NUM     35
#define Y8_GPIO_NUM     34
#define Y7_GPIO_NUM     39
#define Y6_GPIO_NUM     36
#define Y5_GPIO_NUM     21
#define Y4_GPIO_NUM     19
#define Y3_GPIO_NUM     18
#define Y2_GPIO_NUM      5
#define VSYNC_GPIO_NUM  25
#define HREF_GPIO_NUM   23
#define PCLK_GPIO_NUM   22
#define LED_PIN          4     // the bright white flash led

// ---------- options ----------
#define FRAME_SIZE FRAMESIZE_QVGA   // 320x240. FRAMESIZE_VGA (640x480) looks better but is slower
#define JPEG_QUALITY 12             // 10 = best picture, 63 = smallest file
#define FRAME_MS 160                // time between pictures, 160 is about 6 per second
#define FLIP_PICTURE 0              // 1 = turn the picture upside down (camera mounted upside down)
#define MIRROR_PICTURE 0            // 1 = mirror left and right
#define DEBUG 1                     // 1 = print messages on Serial

WebSocketsClient cloud;
bool streaming = false;             // the server says "on" while someone watches
unsigned long lastFrame = 0, wifiLostAt = 0, lastReport = 0;
unsigned long sent = 0;

void say(const char* t) { if (DEBUG) Serial.println(t); }

bool startCamera() {
  camera_config_t c = {};
  c.ledc_channel = LEDC_CHANNEL_0;
  c.ledc_timer = LEDC_TIMER_0;
  c.pin_d0 = Y2_GPIO_NUM; c.pin_d1 = Y3_GPIO_NUM; c.pin_d2 = Y4_GPIO_NUM; c.pin_d3 = Y5_GPIO_NUM;
  c.pin_d4 = Y6_GPIO_NUM; c.pin_d5 = Y7_GPIO_NUM; c.pin_d6 = Y8_GPIO_NUM; c.pin_d7 = Y9_GPIO_NUM;
  c.pin_xclk = XCLK_GPIO_NUM; c.pin_pclk = PCLK_GPIO_NUM;
  c.pin_vsync = VSYNC_GPIO_NUM; c.pin_href = HREF_GPIO_NUM;
  c.pin_sccb_sda = SIOD_GPIO_NUM; c.pin_sccb_scl = SIOC_GPIO_NUM;
  c.pin_pwdn = PWDN_GPIO_NUM; c.pin_reset = RESET_GPIO_NUM;
  c.xclk_freq_hz = 20000000;
  c.pixel_format = PIXFORMAT_JPEG;
  c.frame_size = FRAME_SIZE;
  c.jpeg_quality = JPEG_QUALITY;
  c.fb_count = 2;
  c.fb_location = CAMERA_FB_IN_PSRAM;
  c.grab_mode = CAMERA_GRAB_LATEST;      // always the newest picture, never an old one
  if (esp_camera_init(&c) != ESP_OK) return false;
  sensor_t* s = esp_camera_sensor_get();
  if (s) { s->set_vflip(s, FLIP_PICTURE); s->set_hmirror(s, MIRROR_PICTURE); }
  return true;
}

void onCloud(WStype_t type, uint8_t* payload, size_t length) {
  if (type == WStype_CONNECTED) { say("connected to the server"); }
  else if (type == WStype_DISCONNECTED) { streaming = false; say("disconnected from the server"); }
  else if (type == WStype_TEXT) {
    streaming = (length == 2 && payload[0] == 'o' && payload[1] == 'n');
    say(streaming ? "someone is watching: sending pictures" : "nobody is watching: paused");
  }
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);                  // sleeping WiFi makes the picture stutter
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < 20000) delay(250);
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT); digitalWrite(LED_PIN, LOW);
  if (!startCamera()) {
    say("camera failed to start: check the ribbon cable and the power");
    delay(3000); ESP.restart();
  }
  connectWifi();
  cloud.beginSSL(CLOUD_HOST, 443, "/cam?token=" CAM_TOKEN);
  cloud.onEvent(onCloud);
  cloud.setReconnectInterval(3000);
  cloud.enableHeartbeat(15000, 3000, 2);  // notices a dead connection and reconnects
}

void loop() {
  cloud.loop();

  if (WiFi.status() != WL_CONNECTED) {
    streaming = false;
    if (!wifiLostAt) { wifiLostAt = millis(); WiFi.reconnect(); }
    if (millis() - wifiLostAt > 60000) ESP.restart();     // WiFi gone for a minute: start fresh
    delay(200);
    return;
  }
  wifiLostAt = 0;

  if (streaming && cloud.isConnected() && millis() - lastFrame >= FRAME_MS) {
    lastFrame = millis();
    camera_fb_t* fb = esp_camera_fb_get();
    if (fb) {
      cloud.sendBIN(fb->buf, fb->len);
      esp_camera_fb_return(fb);
      sent++;
    }
  }

  if (DEBUG && millis() - lastReport > 5000) {
    lastReport = millis();
    Serial.printf("wifi %d dBm, server %s, %s, %lu pictures sent, free memory %u\n",
      WiFi.RSSI(), cloud.isConnected() ? "yes" : "no", streaming ? "sending" : "paused", sent, ESP.getFreeHeap());
  }
}
