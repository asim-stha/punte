// Desktop Body firmware - ESP32 (Arduino core 3.x)
// Libs: Adafruit SSD1306, Adafruit GFX, WebSockets (Markus Sattler), DHT sensor library (Adafruit)
// Partition scheme: Minimal SPIFFS (1.9MB APP with OTA)
#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <WebSocketsClient.h>
#include <LittleFS.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <DHT.h>
#include <ESP_I2S.h>
#include <freertos/FreeRTOS.h>
#include <freertos/stream_buffer.h>
#include "secrets.h"   // WIFI_SSID, WIFI_PASS, CLOUD_HOST, ESP_TOKEN

// ---------- pins ----------
const int IN[4] = {14, 27, 26, 25};          // ULN2003 IN1..IN4
#define SERVO_PIN 13
#define MIC_BCLK 32
#define MIC_WS 33
#define MIC_DIN 34
#define SPK_BCLK 19
#define SPK_WS 23
#define SPK_DOUT 16
#define DHT_PIN 17
#define TRIG_PIN 5
#define ECHO_PIN 35      // behind the voltage divider
#define PIR_PIN 36       // labeled VP on the board
#define KNOB_PIN 39      // labeled VN on the board
#define BUTTON_PIN 15    // other leg to GND

// ---------- options ----------
#define USE_SERVO 1        // 1 = head tilt on a servo, 0 = tilt with the stepper
#define STREAM_AUDIO 0     // 1 = send mic audio to the cloud while someone speaks
#define DEBUG_AUDIO 0      // 1 = print mic level on Serial
#define DEBUG_SENSORS 1    // 1 = print the sensor values every 2 seconds
#define LOCAL_TEST 0       // 1 = connect to a test program on your own computer instead of Azure
#define LOCAL_HOST "192.168.0.10"   // your computer's address on the same WiFi
#define LOCAL_PORT 8080

const int TILT_RANGE = 25;           // degrees up or down from level
const int SERVO_CENTER = 90;         // servo angle when the head is level
const int TILT_DIR = 1;              // -1 if the head moves the wrong way
const int CLAP_LEVEL = 8000;         // mic level that counts as a clap
const int VOICE_MIN = 250;           // lowest mic level that counts as a voice
const int NEAR_CM = 60;              // someone closer than this is "near"
const int CLOSE_CM = 10;             // closer than this is a surprise
const unsigned long DROWSY_AFTER = 90000;
const unsigned long SLEEP_AFTER = 150000;

Adafruit_SSD1306 d(128, 64, &Wire, -1);
WebServer http(80);
WebSocketsServer ws(81);
WebSocketsClient cloud;      // connection out to the cloud server
DHT dht(DHT_PIN, DHT11);

// ---------- state ----------
volatile int expr = 0;      // 0 neutral 1 happy 2 sad 3 angry 4 sleepy 5 surprised 6 love 7 think 8 music
volatile bool talking = false;
volatile int look = 0;
char ipText[20] = "";
unsigned long ipUntil = 0;
bool netStarted = false;
float temp = NAN, hum = NAN;
volatile unsigned long infoUntil = 0;

// ---------- stepper (28BYJ-48, 4096 half-steps/rev) ----------
const uint8_t SEQ[8][4] = {{1,0,0,0},{1,1,0,0},{0,1,0,0},{0,1,1,0},{0,0,1,0},{0,0,1,1},{0,0,0,1},{1,0,0,1}};
const float SPD = 4096.0 / 360.0;
long pos = 0, target = 0;
int ph = 0;
unsigned long lastUs = 0, lastMove = 0;
bool coils = false;

void stepperRun() {
  if (pos == target) {
    if (coils && millis() - lastMove > 300) { for (int i = 0; i < 4; i++) digitalWrite(IN[i], 0); coils = false; }
    return;
  }
  if (micros() - lastUs < 1800) return;
  lastUs = micros();
  int dir = target > pos ? 1 : -1;
  pos += dir; ph = (ph + dir + 8) % 8;
  for (int i = 0; i < 4; i++) digitalWrite(IN[i], SEQ[ph][i]);
  coils = true; lastMove = millis();
}

// ---------- head tilt ----------
float tiltNow = 0, tiltTarget = 0;
unsigned long tiltTick = 0, tiltManualUntil = 0, tiltBack = 0;

#if USE_SERVO
void tiltWrite(float deg) {
  float a = SERVO_CENTER + TILT_DIR * deg;
  int us = 500 + (int)(a * (1900.0f / 180.0f));
  ledcWrite(SERVO_PIN, (uint32_t)us * 16383UL / 20000UL);
}
#endif

void tiltRun() {
  unsigned long t = millis();
  if (t - tiltTick < 15) return;
  tiltTick = t;
  tiltTarget = constrain(tiltTarget, -TILT_RANGE, TILT_RANGE);
  float diff = tiltTarget - tiltNow;
#if USE_SERVO
  if (fabsf(diff) < 0.2f) return;
  tiltNow += constrain(diff, -1.2f, 1.2f);
  tiltWrite(tiltNow);
#else
  if (fabsf(diff) < 0.5f) return;
  target += lround(diff * TILT_DIR * SPD);
  tiltNow = tiltTarget;
#endif
}

// ---------- songs (played through the speaker) ----------
const int N_C4 = 262, N_D4 = 294, N_E4 = 330, N_F4 = 349, N_G4 = 392, N_A4 = 440;
struct Note { uint16_t f, ms; };
const Note twinkle[] = {{N_C4,400},{N_C4,400},{N_G4,400},{N_G4,400},{N_A4,400},{N_A4,400},{N_G4,800},{N_F4,400},{N_F4,400},{N_E4,400},{N_E4,400},{N_D4,400},{N_D4,400},{N_C4,800}};
const Note ode[] = {{N_E4,400},{N_E4,400},{N_F4,400},{N_G4,400},{N_G4,400},{N_F4,400},{N_E4,400},{N_D4,400},{N_C4,400},{N_C4,400},{N_D4,400},{N_E4,400},{N_E4,600},{N_D4,200},{N_D4,800}};
const Note jingle[] = {{N_E4,300},{N_E4,300},{N_E4,600},{N_E4,300},{N_E4,300},{N_E4,600},{N_E4,300},{N_G4,300},{N_C4,450},{N_D4,150},{N_E4,1000}};
const Note* SONG[] = {twinkle, ode, jingle};
const uint8_t LEN[] = {14, 15, 11};
volatile int song = -1;          // song that is playing, -1 for none
volatile int songReq = -1;       // song waiting to start
volatile bool songStop = false;
volatile bool songDone = false;

void playSong(int s) {
  songStop = true;
  if (s < 0 || s > 2) { song = -1; songReq = -1; if (expr == 8) expr = 1; return; }
  song = s; songReq = s; expr = 8;
}

// ---------- audio (INMP441 mic in, MAX98357A speaker out) ----------
const int RATE = 16000;
const int FRAMES = 256;
I2SClass mic;
I2SClass spk;
bool micOK = false, spkOK = false;
StreamBufferHandle_t micOut, spkIn;
volatile int chirpReq = 0;
volatile bool evSound = false, evVoice = false;
volatile int micLevel = 0;
volatile int spkVol = 3000;      // speaker loudness, set by the knob
volatile unsigned long quietUntil = 0;
static int32_t micRaw[FRAMES * 2];
static int16_t spkMono[FRAMES * 2];
static int16_t spkOut[FRAMES * 4];

void playTone(int f0, int f1, int ms) {
  if (!spkOK) return;
  int n = RATE * ms / 1000;
  int done = 0;
  float phase = 0;
  while (done < n) {
    int chunk = min(FRAMES, n - done);
    for (int i = 0; i < chunk; i++) {
      int k = done + i;
      float f = f0 + (f1 - f0) * (float)k / n;
      phase += 6.2832f * f / RATE;
      if (phase > 6.2832f) phase -= 6.2832f;
      float env = min(k, n - k) / 160.0f;
      if (env > 1) env = 1;
      int16_t s = (int16_t)(sinf(phase) * spkVol * env);
      spkOut[2 * i] = s; spkOut[2 * i + 1] = s;
    }
    spk.write((uint8_t*)spkOut, chunk * 4);
    done += chunk;
  }
  quietUntil = millis() + 300;
}

void playSilence(int ms) {
  if (!spkOK) return;
  memset(spkOut, 0, sizeof(spkOut));
  int n = RATE * ms / 1000;
  while (n > 0) {
    int chunk = min(FRAMES, n);
    spk.write((uint8_t*)spkOut, chunk * 4);
    n -= chunk;
  }
  quietUntil = millis() + 300;
}

void doChirp(int k) {
  if (k == 1) { playTone(500, 900, 120); playTone(900, 1300, 120); }
  else if (k == 2) { playTone(900, 1200, 90); playTone(1200, 1500, 140); }
  else if (k == 3) { playTone(900, 400, 250); }
  else if (k == 4) { playTone(700, 1400, 100); }
  playSilence(60);
}

void runSong(int s) {
  for (int i = 0; i < LEN[s] && !songStop; i++) {
    const Note& n = SONG[s][i];
    playTone(n.f, n.f, n.ms * 85 / 100);
    playSilence(n.ms * 15 / 100);
  }
  if (!songStop) { song = -1; songDone = true; }
}

void audioTask(void*) {
  float dc = 0, slow = 0, floorLvl = 40;
  unsigned long voiceUntil = 0, lastClap = 0, lastPrint = 0;
  bool voiceOn = false;
  int hot = 0;
  for (;;) {
    if (micOK) {
      size_t got = mic.readBytes((char*)micRaw, sizeof(micRaw));
      int frames = got / 8;
      if (frames > 0) {
        long sum = 0;
        for (int i = 0; i < frames; i++) {
          int32_t s = micRaw[2 * i] >> 14;
          dc += (s - dc) * 0.002f;
          sum += abs(s - (int32_t)dc);
        }
        float level = (float)sum / frames;
        micLevel = (int)level;
        unsigned long now = millis();
        bool quiet = now < quietUntil;
        if (!quiet) {
          if (level < floorLvl * 2.0f) floorLvl += (level - floorLvl) * 0.01f;
          if (floorLvl < 20) floorLvl = 20;
          if (level > CLAP_LEVEL && level > slow * 6.0f) {
            if (++hot >= 1 && now - lastClap > 1500) { evSound = true; lastClap = now; }
          } else hot = 0;
          float voiceTh = max(floorLvl * 3.0f, (float)VOICE_MIN);
          if (level > voiceTh) voiceUntil = now + 500;
          bool on = now < voiceUntil;
          if (on && !voiceOn) evVoice = true;
          voiceOn = on;
        } else {
          voiceOn = false;
        }
        slow += (level - slow) * 0.05f;
#if STREAM_AUDIO
        if (voiceOn) {
          static int16_t pcm[FRAMES];
          for (int i = 0; i < frames; i++) {
            int32_t v = (micRaw[2 * i] >> 14) - (int32_t)dc;
            pcm[i] = (int16_t)constrain(v, -32768, 32767);
          }
          xStreamBufferSend(micOut, pcm, frames * 2, 0);
        }
#endif
#if DEBUG_AUDIO
        if (now - lastPrint > 500) {
          lastPrint = now;
          Serial.printf("mic %d floor %d\n", (int)level, (int)floorLvl);
        }
#endif
      }
    } else {
      vTaskDelay(20 / portTICK_PERIOD_MS);
    }

    if (spkOK) {
      int sr = songReq;
      if (sr >= 0) { songReq = -1; songStop = false; runSong(sr); }
      size_t have = xStreamBufferReceive(spkIn, spkMono, sizeof(spkMono), 0);
      int n = have / 2;
      if (n > 0) {
        for (int i = 0; i < n; i++) { spkOut[2 * i] = spkMono[i]; spkOut[2 * i + 1] = spkMono[i]; }
        spk.write((uint8_t*)spkOut, n * 4);
        quietUntil = millis() + 400;
      }
      int c = chirpReq;
      if (c) { chirpReq = 0; doChirp(c); }
    }
  }
}

// ---------- face ----------
void thick(int x0, int y0, int x1, int y1) { for (int i = -1; i <= 1; i++) d.drawLine(x0, y0 + i, x1, y1 + i, 1); }
void heart(int cx, int cy) { d.fillCircle(cx-6, cy-3, 7, 1); d.fillCircle(cx+6, cy-3, 7, 1); d.fillTriangle(cx-13, cy, cx+13, cy, cx, cy+14, 1); }

void face() {
  unsigned long t = millis();
  d.clearDisplay();
  int lx = 34 + look, rx = 94 + look, y = 24;
  bool blink = (t % 4200) < 140;
  int h = blink ? 3 : 28;
  int e = expr;
  if (e == 0 || e == 2 || e == 3) {
    d.fillRoundRect(lx-14, y-h/2, 28, h, 6, 1);
    d.fillRoundRect(rx-14, y-h/2, 28, h, 6, 1);
    if (!blink && e == 2) {          // sad: outer-top cut
      d.fillTriangle(lx-15, y-15, lx, y-15, lx-15, y-2, 0);
      d.fillTriangle(rx+15, y-15, rx, y-15, rx+15, y-2, 0);
    }
    if (!blink && e == 3) {          // angry: inner-top cut
      d.fillTriangle(lx+15, y-15, lx, y-15, lx+15, y-2, 0);
      d.fillTriangle(rx-15, y-15, rx, y-15, rx-15, y-2, 0);
    }
  } else if (e == 1 || e == 8) {     // happy ^ ^
    thick(lx-12, y+8, lx, y-6); thick(lx, y-6, lx+12, y+8);
    thick(rx-12, y+8, rx, y-6); thick(rx, y-6, rx+12, y+8);
    if (e == 8) {                    // bobbing note
      int by = 44 + ((t / 200) % 2) * 3;
      d.fillCircle(112, by, 3, 1); d.drawLine(115, by, 115, by-10, 1); d.drawLine(115, by-10, 119, by-8, 1);
    }
  } else if (e == 4) {               // sleepy
    d.fillRoundRect(lx-14, y+2, 28, 6, 3, 1); d.fillRoundRect(rx-14, y+2, 28, 6, 3, 1);
    d.setTextColor(1); d.setTextSize(1 + (t / 700) % 2); d.setCursor(108, 4); d.print("z");
  } else if (e == 5) {               // surprised
    d.drawCircle(lx, y, 13, 1); d.drawCircle(rx, y, 13, 1);
    d.fillCircle(lx, y, 5, 1); d.fillCircle(rx, y, 5, 1);
  } else if (e == 6) {               // love
    heart(lx, y-2); heart(rx, y-2);
  } else if (e == 7) {               // think
    d.fillRoundRect(lx-8, y-16, 20, 20, 5, 1); d.fillRoundRect(rx-8, y-16, 20, 20, 5, 1);
    d.setTextColor(1); d.setTextSize(1); d.setCursor(100, 50);
    for (int i = 0; i < (int)((t / 400) % 4); i++) d.print(".");
  }
  // mouth
  if (talking) {
    int mh = 3 + ((t / 80) % 4) * 3;
    d.fillRoundRect(54, 50, 20, mh, 3, 1);
  } else if (e == 1 || e == 6 || e == 8) {
    d.drawLine(54, 50, 60, 55, 1); d.drawLine(60, 55, 68, 55, 1); d.drawLine(68, 55, 74, 50, 1);
  } else if (e == 2) {
    d.drawLine(54, 56, 60, 51, 1); d.drawLine(60, 51, 68, 51, 1); d.drawLine(68, 51, 74, 56, 1);
  } else if (e != 5) {
    d.fillRect(58, 54, 12, 2, 1);
  }
  if (t < ipUntil) { d.setTextColor(1); d.setTextSize(1); d.setCursor(0, 0); d.print(ipText); }
  if (t < infoUntil) {
    char buf[24];
    if (isnan(temp) || isnan(hum)) snprintf(buf, sizeof(buf), "no reading");
    else snprintf(buf, sizeof(buf), "%.1fC %d%%", temp, (int)hum);
    d.setTextColor(1); d.setTextSize(1); d.setCursor(0, 56); d.print(buf);
  }
  d.display();
}

void dispTask(void*) { for (;;) { face(); vTaskDelay(50 / portTICK_PERIOD_MS); } }

// ---------- own behaviour: moods, idle moves, sleeping ----------
enum State { AWAKE, DROWSY, ASLEEP };
State state = AWAKE;
int energy = 80, boredom = 0, affection = 0;
int energyDiv = 0, affDiv = 0;
bool autoExpr = false;
unsigned long lastInteract = 0, nextIdle = 8000, exprBack = 0, lookBack = 0, moodTick = 0;
const int8_t NOD[] = {10, -6, 8, 0};
int nodI = -1;
unsigned long nodAt = 0;

void sendEvent(const char* e) {
  static unsigned long last = 0;
  if (millis() - last < 700) return;
  last = millis();
  if (netStarted) {
    ws.broadcastTXT(e);
    if (cloud.isConnected()) cloud.sendTXT(e);
  }
}

void setAuto(int e, unsigned long ms) {
  expr = e; autoExpr = true; exprBack = millis() + ms;
}

void wakeUp() {
  state = AWAKE;
  tiltTarget = 0; tiltBack = 0;
  energy = max(energy, 40);
  setAuto(5, 1200);
  chirpReq = 1;
  sendEvent("ev:wake");
}

void interact() {
  lastInteract = millis();
  if (state != AWAKE) wakeUp();
}

void mind() {
  unsigned long t = millis();

  if (songDone) { songDone = false; if (expr == 8) setAuto(1, 3000); }

  if (t - moodTick >= 2000) {
    moodTick = t;
    if (t - lastInteract < 10000) boredom = max(0, boredom - 4); else boredom = min(100, boredom + 1);
    if (state == AWAKE) { if (++energyDiv >= 15) { energyDiv = 0; energy = max(0, energy - 1); } }
    else energy = min(100, energy + 1);
    if (affection > 0 && ++affDiv >= 10) { affDiv = 0; affection--; }
  }

  if (evSound) {
    evSound = false;
    lastInteract = t;
    if (state != AWAKE) wakeUp();
    else if (expr == 0 && !talking) { setAuto(5, 1000); look = random(-8, 9); lookBack = t + 1200; }
    sendEvent("ev:sound");
  }
  if (evVoice) {
    evVoice = false;
    lastInteract = t;
    if (state != AWAKE) wakeUp();
    else if (t > tiltManualUntil) { tiltTarget = 6; tiltBack = t + 3000; }
    affection = min(100, affection + 2);
    sendEvent("ev:voice");
  }

  if (autoExpr && t > exprBack) { autoExpr = false; if (state == AWAKE) expr = 0; }
  if (lookBack && t > lookBack) { look = 0; lookBack = 0; }
  if (tiltBack && t > tiltBack) { tiltTarget = 0; tiltBack = 0; }
  if (nodI >= 0 && t >= nodAt) {
    tiltTarget = NOD[nodI];
    nodI++; nodAt = t + 260;
    if (nodI >= 4) nodI = -1;
  }

  unsigned long idle = t - lastInteract;
  if (!talking && song < 0) {
    if (state == AWAKE && idle > DROWSY_AFTER) { state = DROWSY; autoExpr = false; expr = 4; tiltTarget = -12; tiltBack = 0; }
    else if (state == DROWSY && idle > SLEEP_AFTER) { state = ASLEEP; tiltTarget = -TILT_RANGE; }
  }
  if (state != AWAKE) return;
  if (talking || song >= 0 || expr != 0) return;
  if (t < nextIdle) return;

  nextIdle = t + random(4000, 10000);
  int r = random(100);
  bool tiltFree = t > tiltManualUntil;
  if (energy < 25 && boredom > 40 && r < 30) {
    setAuto(4, 2200);
    if (tiltFree) { tiltTarget = -10; tiltBack = t + 2400; }
  } else if (boredom > 60 && r < 25) {
    setAuto(7, 2500);
    look = random(-8, 9); lookBack = t + 2000;
  } else if (affection > 40 && r < 20) {
    setAuto(6, 2000);
    affection = max(0, affection - 10);
  } else if (r < 45) {
    look = random(-8, 9); lookBack = t + random(800, 1800);
  } else if (r < 70 && tiltFree) {
    tiltTarget = random(-12, 13); tiltBack = t + random(1500, 3000);
  } else if (r < 85 && tiltFree) {
    nodI = 0; nodAt = t;
  }
}

// ---------- sensors: eyes (distance), PIR, DHT11, knob, button ----------
volatile unsigned long echoRise = 0, echoFall = 0;
volatile bool echoDone = false;
float distCm = -1;                // -1 when nothing came back
bool pinging = false, personNear = false;
int nearCount = 0, farCount = 0;
unsigned long pingAt = 0, lastGreet = 0, lastClose = 0;
int pirLast = 0;
unsigned long lastPirRefresh = 0;
unsigned long lastDht = 0;
int knobAvg = 0, knobPct = 0;
unsigned long knobTick = 0;
bool btnHeld = false, btnLong = false;
unsigned long btnDown = 0;
unsigned long lastSensorPrint = 0;

void IRAM_ATTR onEcho() {
  if (digitalRead(ECHO_PIN)) echoRise = micros();
  else { echoFall = micros(); echoDone = true; }
}

void petRobot() {
  lastInteract = millis();
  affection = min(100, affection + 25);
  if (state != AWAKE) wakeUp();
  else { setAuto(6, 2000); chirpReq = 2; }
  sendEvent("ev:touch");
}

void sensorsRun() {
  unsigned long t = millis();

  // eyes: send a ping, then read the echo time when the interrupt has caught it
  if (!pinging && t - pingAt >= 150) {
    pingAt = t; pinging = true; echoDone = false;
    digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10); digitalWrite(TRIG_PIN, LOW);
  } else if (pinging && (echoDone || t - pingAt > 35)) {
    pinging = false;
    float cm = -1;
    if (echoDone) {
      cm = (float)(echoFall - echoRise) * 0.0343f / 2;
      if (cm < 2 || cm > 250) cm = -1;
    }
    distCm = cm;
    if (cm >= 2 && cm <= NEAR_CM) { nearCount++; farCount = 0; }
    else if (cm < 0 || cm > 100) { farCount++; nearCount = 0; }
    else nearCount = 0;

    if (!personNear && nearCount >= 2) {
      personNear = true;
      if (t - lastGreet > 8000) {
        lastGreet = t;
        lastInteract = t;
        if (state != AWAKE) wakeUp();
        else if (!talking && song < 0) {
          setAuto(1, 2500); chirpReq = 1;
          if (t > tiltManualUntil) { tiltTarget = 8; tiltBack = t + 3000; }
        }
        sendEvent("ev:near");
      }
    }
    if (personNear && farCount >= 8) personNear = false;
    if (personNear && cm >= 2 && cm < CLOSE_CM && nearCount >= 2 && state == AWAKE && !talking && song < 0 && t - lastClose > 6000) {
      lastClose = t; setAuto(5, 1500); chirpReq = 4;
    }
  }

  // PIR: motion wakes the robot, it settles for the first minute after power on
  int pir = digitalRead(PIR_PIN);
  if (pir && !pirLast && t > 60000) {
    bool idleLong = t - lastInteract > 30000;
    lastPirRefresh = t;
    if (state != AWAKE) { lastInteract = t; wakeUp(); }
    else {
      if (idleLong && !talking && song < 0 && expr == 0 && t - lastGreet > 8000) {
        lastGreet = t; setAuto(1, 2000); chirpReq = 1;
      }
      lastInteract = t;
    }
    sendEvent("ev:motion");
  } else if (pir && t > 60000 && state == AWAKE && t - lastPirRefresh > 10000) {
    lastPirRefresh = t; lastInteract = t;
  }
  pirLast = pir;

  // knob: speaker volume
  if (t - knobTick >= 100) {
    knobTick = t;
    knobAvg += (analogRead(KNOB_PIN) - knobAvg) / 4;
    int pct = map(knobAvg, 0, 4095, 0, 100);
    spkVol = 200 + pct * 70;
    if (abs(pct - knobPct) >= 6) {
      knobPct = pct;
      lastInteract = t;
      if (state != AWAKE) wakeUp();
    }
  }

  // button: short press pets the robot, hold for one second to show temperature and humidity
  bool down = digitalRead(BUTTON_PIN) == LOW;
  if (down && !btnHeld) { btnHeld = true; btnLong = false; btnDown = t; }
  if (down && btnHeld && !btnLong && t - btnDown > 1000) {
    btnLong = true;
    infoUntil = t + 4000;
    lastInteract = t;
    if (state != AWAKE) wakeUp();
  }
  if (!down && btnHeld) {
    btnHeld = false;
    if (!btnLong && t - btnDown > 40) petRobot();
  }

  // DHT11: read slowly, and only while the head is not turning
  unsigned long every = isnan(temp) ? 3000 : 20000;
  if (t - lastDht > every && pos == target && !talking) {
    lastDht = t;
    float tt = dht.readTemperature();
    float hh = dht.readHumidity();
    if (!isnan(tt) && !isnan(hh)) { temp = tt; hum = hh; }
  }

#if DEBUG_SENSORS
  if (t - lastSensorPrint > 2000) {
    lastSensorPrint = t;
    Serial.printf("temp %.1f C | hum %.0f%% | dist %.0f cm | pir %d | volume %d%% | state %d\n",
                  temp, hum, distCm, pir, knobPct, (int)state);
  }
#endif
}

// ---------- commands: "x:1" expr | "t:1" talk | "n:5" nudge deg | "r:45" rotate deg
// ---------- "p:90" absolute deg | "m:0" song (-1 stop) | "l:3" eye look
// ---------- "h:10" head tilt deg (+ up) | "u:5" tilt nudge | "c:2" chirp
void handle(String s) {
  if (s.length() < 3) return;
  char c = s[0]; String a = s.substring(2); float f = a.toFloat();
  if (c == 'x') { expr = constrain(a.toInt(), 0, 8); autoExpr = false; }
  else if (c == 't') talking = a.toInt();
  else if (c == 'n' || c == 'r') target = pos + lround(f * SPD);
  else if (c == 'p') {
    long cur = ((pos % 4096) + 4096) % 4096;
    long want = lround(fmod(f + 360, 360) * SPD);
    long dl = want - cur;
    if (dl > 2048) dl -= 4096;
    if (dl < -2048) dl += 4096;
    target = pos + dl;
  }
  else if (c == 'm') playSong(a.toInt());
  else if (c == 'l') { look = constrain(a.toInt(), -8, 8); lookBack = 0; }
  else if (c == 'h') { tiltTarget = f; tiltManualUntil = millis() + 6000; tiltBack = 0; nodI = -1; }
  else if (c == 'u') { tiltTarget += f; tiltManualUntil = millis() + 6000; tiltBack = 0; nodI = -1; }
  else if (c == 'c') chirpReq = a.toInt();
}

void onWs(uint8_t n, WStype_t type, uint8_t* p, size_t len) {
  if (type == WStype_TEXT) { interact(); handle(String((char*)p)); }
}

void onCloud(WStype_t type, uint8_t* p, size_t len) {
  if (type == WStype_CONNECTED) Serial.println("cloud: connected");
  else if (type == WStype_DISCONNECTED) Serial.println("cloud: not connected, trying again");
  else if (type == WStype_ERROR) Serial.println("cloud: error");
  if (type == WStype_TEXT) {
    String s; s.reserve(len);
    for (size_t i = 0; i < len; i++) s += (char)p[i];
    interact();
    handle(s);
  } else if (type == WStype_BIN) {
    xStreamBufferSend(spkIn, p, len, 0);
  }
}

// ---------- storage for AI memory + faces (readable from phone) ----------
void store() {
  http.sendHeader("Access-Control-Allow-Origin", "*");
  String k = http.arg("k");
  if (k != "mem" && k != "faces") { http.send(400, "text/plain", "bad"); return; }
  String p = "/" + k + ".json";
  if (http.method() == HTTP_POST) {
    File f = LittleFS.open(p, "w"); f.print(http.arg("plain")); f.close();
    http.send(200, "text/plain", "ok");
  } else {
    if (!LittleFS.exists(p)) { http.send(200, "application/json", k == "mem" ? "{}" : "[]"); return; }
    File f = LittleFS.open(p, "r"); http.streamFile(f, "application/json"); f.close();
  }
}

const char PAGE[] PROGMEM = R"HTML(<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<body style="font:16px sans-serif;background:#111;color:#eee;padding:12px"><h3>Desktop Body</h3><div id=bx></div>
<script>
const w=new WebSocket('ws://'+location.hostname+':81');const s=c=>w.send(c);
const B=(t,c)=>{const e=document.createElement('button');e.textContent=t;e.style.cssText='margin:4px;padding:12px';e.onclick=()=>s(c);bx.append(e)};
['neutral','happy','sad','angry','sleepy','surprised','love','think'].forEach((n,i)=>B(n,'x:'+i));
B('<< 45','r:-45');B('45 >>','r:45');B('Front','p:0');B('Back','p:180');B('Spin','r:360');
B('Head up','h:15');B('Head level','h:0');B('Head down','h:-15');B('Chirp','c:2');
B('Song1','m:0');B('Song2','m:1');B('Song3','m:2');B('Stop','m:-1');
</script><h4>AI memory</h4><textarea id=m rows=14 style="width:100%"></textarea><br><button onclick="sv()">Save</button>
<script>fetch('/store?k=mem').then(r=>r.text()).then(t=>m.value=t);function sv(){fetch('/store?k=mem',{method:'POST',body:m.value}).then(()=>alert('saved'))}</script>)HTML";

void netCheck() {
  if (netStarted || WiFi.status() != WL_CONNECTED) return;
  netStarted = true;
  snprintf(ipText, sizeof(ipText), "%s", WiFi.localIP().toString().c_str());
  ipUntil = millis() + 5000;
  Serial.printf("WiFi connected, robot address %s\n", ipText);
#if LOCAL_TEST
  Serial.printf("connecting to %s port %d\n", LOCAL_HOST, LOCAL_PORT);
#else
  Serial.printf("connecting to %s\n", CLOUD_HOST);
#endif
  http.on("/", []() { http.send_P(200, "text/html", PAGE); });
  http.on("/store", HTTP_ANY, store);
  http.begin();
  ws.begin(); ws.onEvent(onWs);
#if LOCAL_TEST
  cloud.begin(LOCAL_HOST, LOCAL_PORT, "/esp?token=" ESP_TOKEN);
#else
  cloud.beginSSL(CLOUD_HOST, 443, "/esp?token=" ESP_TOKEN);
#endif
  cloud.onEvent(onCloud);
  cloud.setReconnectInterval(5000);
  cloud.enableHeartbeat(15000, 3000, 2);
}

void setup() {
  Serial.begin(115200);
  randomSeed(esp_random());
  for (int i = 0; i < 4; i++) pinMode(IN[i], OUTPUT);
#if USE_SERVO
  ledcAttach(SERVO_PIN, 50, 14);
  tiltWrite(0);
#endif
  LittleFS.begin(true);
  Wire.begin(21, 22); Wire.setClock(400000);
  d.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  d.setTextColor(1); d.setTextSize(1);

  pinMode(TRIG_PIN, OUTPUT);
  digitalWrite(TRIG_PIN, LOW);
  pinMode(ECHO_PIN, INPUT);
  attachInterrupt(digitalPinToInterrupt(ECHO_PIN), onEcho, CHANGE);
  pinMode(PIR_PIN, INPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  dht.begin();
  knobAvg = analogRead(KNOB_PIN);
  knobPct = map(knobAvg, 0, 4095, 0, 100);
  spkVol = 200 + knobPct * 70;

  micOut = xStreamBufferCreate(8192, 1);
  spkIn = xStreamBufferCreate(16384, 1);
  mic.setPins(MIC_BCLK, MIC_WS, -1, MIC_DIN);
  micOK = mic.begin(I2S_MODE_STD, RATE, I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_STEREO, I2S_STD_SLOT_BOTH);
  spk.setPins(SPK_BCLK, SPK_WS, SPK_DOUT, -1);
  spkOK = spk.begin(I2S_MODE_STD, RATE, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO, I2S_STD_SLOT_BOTH);
  if (!micOK) Serial.println("mic failed to start");
  if (!spkOK) Serial.println("speaker failed to start");

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  lastInteract = millis();
  xTaskCreatePinnedToCore(dispTask, "disp", 4096, NULL, 1, NULL, 0);
  xTaskCreatePinnedToCore(audioTask, "audio", 8192, NULL, 2, NULL, 0);
  chirpReq = 1;
}

void loop() {
  netCheck();
  static unsigned long lastWait = 0;
  if (!netStarted && millis() - lastWait > 3000) {
    lastWait = millis();
    Serial.printf("waiting for WiFi, status %d\n", (int)WiFi.status());
  }
  if (netStarted) {
    http.handleClient();
    ws.loop();
    cloud.loop();
  }
  stepperRun();
  tiltRun();
  sensorsRun();
  mind();
#if STREAM_AUDIO
  static uint8_t chunk[512];
  if (netStarted && cloud.isConnected() && xStreamBufferBytesAvailable(micOut) >= 512) {
    xStreamBufferReceive(micOut, chunk, 512, 0);
    cloud.sendBIN(chunk, 512);
  }
#endif
}