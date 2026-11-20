# Demo day

Do these steps in order, about 30 minutes before the demo.

## 1. The server

- Open the website and log in.
- Open Settings and look at the System status card. Proxy, Frontend, Backend, Database, Voice and Listening must be green.
- If one is red, connect to the VM and run this inside `punte/docker`:

```
docker compose ps
docker compose up -d
```

- For phones, the Server AI line should be green too. If it is grey, run:

```
docker compose --profile server-ai up -d
```

## 2. The demo computer

- Start Ollama. Check that `ollama list` shows the model from Settings (`llama3.1:8b`).
- `OLLAMA_ORIGINS` must contain the address of the website. After changing it, restart Ollama.
- Use Chrome or Edge. Allow the camera and the microphone when the browser asks.
- In System status the line "AI on this computer" should be green.
- Ask one question and look at the Chat panel. It should say "Last answer: this computer".

## 3. The robot

- Switch the robot on and wait about 10 seconds. The pill at the top changes to "Robot online".
- Press Robot at the top, then Connect.
- Try one mood, one head move, and pass your hand over the IR sensor.
- Say the wake name and ask a short question.

## 4. A phone

- Use mobile data, not the school Wi-Fi, so you know it works from outside.
- Log in and ask one short question. The first answer can take a few seconds.

## If something breaks during the demo

- The robot is silent: the website still speaks from the computer. Check Voice in System status.
- The AI on the computer stops: the website uses the server by itself. Answers are slower.
- The website says "login required": the backend restarted. Log in again.
- The robot is offline: switch it off and on. It connects again by itself.
- Nothing opens: check `docker compose ps` on the VM and the VM itself in the Azure portal.

## Keep ready

- The team password and the VM key file.
- A phone hotspot, in case the Wi-Fi blocks the robot.
- A power bank or charger for the robot.
