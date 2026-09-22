# Sathi (साथी) — Security (Advanced, zero-PII by design)

## 1. Threat model (STRIDE) — and how each is handled

| Threat | Risk here | Mitigation (in code) |
|---|---|---|
| **Spoofing** (fake helper, fake SOS) | low→med | no accounts (nothing to spoof); opt-in helpers only; SOS rate limit 3/min/socket; location must be fresh (<90 s); anonymous matching hides both sides |
| **Tampering** (man-in-the-middle) | med | **WebRTC DTLS-SRTP** media encryption; Socket.IO over **WSS/HTTPS** (free certs); CSP forbids inline/foreign scripts; `nosniff` |
| **Repudiation** (denying an incident) | low | client **incident report** (session id, time, coords, duration, event log) — privacy-preserving, shareable to police |
| **Information disclosure** | **the core risk** | **no PII exists**: no names, no numbers, no accounts, no DB. Location ephemeral (session-only). Audit log stores only socket-scoped event types + IP (never coordinates). `x-powered-by` off, no stack traces to clients |
| **Denial of service** | high | per-event **token buckets** (sos 3/min, loc 2/s, chat 12/min, rtc 120/s), per-IP **connection flood guard** (30/min), size caps on SDP (20 KB) / candidates (4 KB) / text (500 chars), watchdog reaper, error containment |
| **Elevation of privilege** | low | no auth surface; admin audit route requires `ADMIN_TOKEN` (401/503 otherwise); server binds 0.0.0.0 only behind LB/VM firewall |

## 2. HTTP hardening (helmet + custom)

- **Content-Security-Policy:** `default-src 'self'`, `object-src 'none'`,
  strict `connect-src` allow-list (self + OSM/CARTO tiles + MyMemory +
  Lingva), `base-uri 'self'`, fonts only from googleapis/gstatic.
  Production mode (`SATHI_PROD=1`) adds `frame-ancestors 'none'`.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
  `x-powered-by` disabled, strict-transport when HTTPS fronted.
- Cache policy: long cache for static only in prod, no-cache in dev.

## 3. Socket hardening

- **Allow-list events only** (unknown events have no handler → no-op).
- Every event **validated** (`validPoint`, `validText`, `validPairId`,
  `validRole`, `validLang`) — type + range + length.
- **Rate limits** per socket (token bucket): sos 3/min · loc 2/s ·
  chat/speech 12/min · rtc 120/s · nearby 10/30s · ready 6/min · push 5/min.
- **Connection flood:** 30 handshakes/min/IP → rejected at handshake.
- **Size caps:** text ≤500 chars, SDP ≤20 KB, candidate ≤4 KB,
  push endpoint ≤2 KB.
- Pair isolation: events reference `pairId` which must match the sender's
  active pair; a client can never touch another pair.

## 4. Data protection

| Data | Lifetime | Where |
|---|---|---|
| `{socketId → lat,lng,ts}` | session (max ~3 min after silence) | RAM / Redis (volatile) |
| Pair (who↔who, anonymous) | call duration | RAM |
| Push subscription | until user revokes | RAM |
| Audit (event type + IP, **no coords, no PII**) | 5000-entry ring | RAM (`/api/audit` with token) |
| Incident report | user's device only | user localStorage |
| **Phone numbers / names / accounts** | **never collected** | — |

**No database. No backups needed. Nothing to breach.**

## 5. Secrets & keys

- **VAPID keys** auto-generated (ECDSA P-256) on first boot, stored in
  `keys/vapid.json` — **git-ignored**, regenerate with `rm keys/vapid.json`.
- `ADMIN_TOKEN` env gates the audit endpoint (unset = disabled, 503).
- `REDIS_URL`, `PORT`, `SATHI_PROD` — env-configured, no secrets in code.

## 6. Supply chain

- 8 runtime deps, all mainstream (express, socket.io, leaflet, helmet,
  web-push, ioredis, @socket.io/redis-adapter + transitive).
- `npm audit` → **0 vulnerabilities** (run it; it's in CI-friendly form).
- No eval, no dynamic imports, no user-supplied HTML (all user text is
  escaped before DOM insertion).

## 7. Residual risks (honest)

- Free tier infra (Oracle etc.) can be rate-limited/deprioritized —
  mitigation: multi-provider compose, keep 1 paid VM as cold spare.
- Client-side code is inspectable (all web apps are) — the design ensures
  **inspecting it reveals nothing** (no secrets, no PII, no logic worth
  stealing beyond open-source).
- Volunteer *behavior* is a safety risk (not a cyber one) — roadmap:
  verification + rating + SOS to 112 as the permanent backstop.
