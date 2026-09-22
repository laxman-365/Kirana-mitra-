# Sathi (साथी) — Never alone

> **महिला, मुले व आणीबाणी सुरक्षा App (prototype)**
> A web app (runs on phone browser, installable as PWA) that gives women, children and anyone in trouble one button to safety.

## Problem (प्रश्न)

संकटात (कोणत्याही ठिकाणी — मोठी समस्या किंवा लहानही) मदत करायला जाणारे
लोकचे **नंबर मागच्यावर नसतात**, **पॉलिस इत्यादींची सुविधा लगेच आढळत नाही**,
आणि **आणीबाणीचे नंबर माहितीही नसतात** — त्यामुळे अनर्थ होतो.

In trouble, you often don't have anyone's number, can't find police/ambulance
quickly, and may not even know emergency numbers. That gap causes harm.

## Solution (उपाय)

1. **SOS button** — 2 seconds hold.
2. App picks a **RANDOM** "Sathi" (volunteer) who is within **500 m** of your
   live location (expands to 1 km → 2.5 km if nobody is nearby) and places an
   **in-app voice call automatically** (WebRTC).
3. **Zero identity**: no phone number, no name, no profile. Each side only
   sees an anonymous id (e.g. `Sathi #4821`).
4. **Mutual live location** — during the call both parties see each other on
   a live map (blue = you, red = the other person), updated every couple of
   seconds. You can also share the location link with police/family.
5. **Emergency numbers always one tap away** — 112, 100, 1091, 1098, 108,
   1090, 181, 1930 with one-tap dialing (for when you don't know the numbers).
6. **Sathi (volunteer) mode** — open the app, tap “I'm ready to help”, and
   you join the 500 m help pool. When someone near you presses SOS, the app
   calls you (with a countdown so you can accept immediately or decline).
7. **23 भाषा / 23 languages** (8th Schedule + English) — full UI in
   Marathi, Hindi, Gujarati, English; critical SOS strings in all 19 others.
8. **In-call language translation** — translated chat (type in your language,
   the other side reads theirs, via free MyMemory + English bridge) and live
   voice subtitles (Web Speech API, where the browser supports the language).
   Example: मराठीत बोला/लिहा → त्यांना ગુજરાતીत; उलटही.

> 🔎 **पूर्ण माहिती व प्रश्न-उत्तरे (trust doc):** [QUESTIONS_ANSWERS.md](./QUESTIONS_ANSWERS.md)
> satellite/GPS, free cost, hosting without paid APIs, data usage, WebRTC,
> map, translation, privacy — सर्व तपशील देवनागरी मराठीत.

## 🏛️ Full scale (national level, 70–80 crore) — what's in the box

- **Stateless nodes + shared Redis** — `REDIS_URL` set → Socket.IO
  redis-adapter → add nodes behind the LB. `docker compose up -d` runs the
  real production topology: **nginx LB → 2 app nodes → Redis**.
- **Geo matching:** bbox pre-filter + haversine (in-memory, measured fast)
  → Redis GEO (GEOADD/GEOSEARCH) in multi-node mode.
- **Load proof:** `npm run test:load` — 1000 helpers, 25 sequential SOS,
  0 failures, reports p50/p95 match latency.
- **Self-healing everywhere:** offline SOS queue (auto-sent on reconnect),
  socket state resume, auto ICE-restart on call failure, location-watch
  watchdog, tile failover (OSM→CARTO), translation failover
  (MyMemory→Lingva→en-bridge), stale-entry reaper, error containment with
  supervisor restart, nginx `max_fails` failover.
- **Web Push (free):** backgrounded/closed helper phones still get the
  "SOS nearby" notification (auto-generated VAPID keys).
- **Security (advanced):** helmet CSP, per-event token-bucket rate limits,
  per-IP connection flood guard, strict validators + size caps, audit ring
  (token-gated), zero-PII by design (no DB, no names, no numbers).
  → [SECURITY.md](./SECURITY.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) ·
  [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Incident report:** every SOS session saves a privacy-preserving report
  (session id + time + location + duration + event log, **no PII**) shareable
  to police/family.
- **Ops:** `/healthz`, `/metrics` (Prometheus), `/api/audit`, systemd unit,
  Dockerfile with healthcheck, 0 npm-audit vulnerabilities.

## Run it (सुरू कसे करावे)

```bash
cd sathi
npm install
npm start          # http://localhost:3000
```

### Demo in 2 tabs (प्रायोगिक डेमो)

1. Open the app in **two browser tabs**.
2. Tab 1 → **मला मदत करायची आहे** (ready to help) — allow location.
3. Tab 2 → **मदत हवी आहे** — **hold SOS for 2 s**.
4. Tab 1 gets the SOS call (auto-answer countdown) → accept.
5. Both tabs now show **each other's live location** on the map. No numbers
   ever appear. End the call → both return to their modes.

Headless test of the matching core (server must be running):

```bash
npm test
```

## Architecture

| Layer | Tech |
|---|---|
| Server | Node.js + Express + **Socket.IO** (presence pool, matching, signalling relay, language + chat/speech relay) |
| Voice call | **WebRTC** (RTCPeerConnection), STUN only — anonymous, no numbers |
| Map | **Leaflet** + OpenStreetMap tiles (no API key) |
| UI | Vanilla JS, mobile-first, **23-language i18n** (4 full + 19 critical) |
| Translation | **MyMemory free API** (+ English bridge, cached) for chat/subtitles; **Web Speech API** for local speech-to-text |

### Matching rules (server)

- Helpers must send a fresh location (< 90 s) to stay in the pool.
- On SOS: eligible = helpers within 500 m → pick **randomly**. If none:
  expand to 1 km, then 2.5 km (client shows each ring). If still none:
  `no-helpers` → UI pushes **112**.
- A matched helper is removed from the pool for the duration of the call.
- No answer in 25 s → pair dissolves, SOS automatically retries (up to 3).
- If a peer disconnects mid-call → the other side is notified and retries.

### Privacy by design

- **No accounts, no phone numbers, no names** are collected or transmitted —
  only random socket ids and coordinates.
- Location is shared **only** while a help session is active, then dropped.
- Volunteers must explicitly opt in (“ready to help”) and can stop anytime.

## Known limits & next steps (पुढचे पाऊल)

- This is a **working prototype** on the web. For a store app: wrap the same
  server + UI in **React Native / Flutter** (WebRTC & maps both supported) or
  a native Android app with foreground location service.
- Real product needs: accounts + vetting for volunteers, abuse/SCAM guard,
  rate limiting, call recording option (with consent), integration with
  112 control room (send live location), push notifications when app is
  backgrounded, offline SOS fallback (SMS).
- Voice call uses WebRTC with public STUN; for reliability in production add
  your own STUN/TURN (e.g. coturn).

---

Sathi — *आपण एकटे नाही* 🤝
