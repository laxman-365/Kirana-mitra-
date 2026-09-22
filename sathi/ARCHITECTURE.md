# Sathi (साथी) — Architecture (National Scale: 70–80 crore users)

## 1. Design principles

1. **Stateless nodes** — any node can serve any user; all shared state
   (presence, rooms) lives in Redis. Scale = add nodes behind the LB.
2. **Data minimization = security** — no accounts, no phone numbers, no
   names. The server stores *only* ephemeral `{socketId → lat, lng, ts}`
   and active pairs. There is nothing to back up, nothing to breach.
3. **Free, boring technology** — Node, Express, Socket.IO, Redis, nginx,
   OSM, WebRTC, MyMemory. Every component has a free tier that survives
   national scale (see §6).
4. **Self-healing at every layer** — see §7.

## 2. Topology (what we ship)

```
                       ┌────────────┐
   70–80 cr users ───▶ │   CDN      │  static app (html/js/css/leaflet)
   (phones, PWA)       │ (free tier)│  → nodes only carry live traffic
                       └─────┬──────┘
                             │ https
                       ┌─────▼──────┐
                       │   nginx    │  LB + websocket upgrade
                       │  (free)    │  least_conn, max_fails
                       └──┬──────┬──┘
                     ┌────▼──┐ ┌─▼────┐   N nodes (stateless)
                     │ node 1 │ │node 2│  …
                     │ Socket │ │Socket│
                     │ .IO +  │ │ .IO  │
                     │ match  │ │ match│
                     └────┬───┘ └──┬───┘
                        ┌──▼───────▼──┐
                        │   Redis     │  GEOADD/GEOSEARCH presence,
                        │  (free tier)│  socket.io redis-adapter (rooms)
                        └─────────────┘
   External (free): OSM tiles · Google STUN · MyMemory/Lingva (translation)
                    · Web Push (browsers) / FCM (native, free tier)
```

`docker compose up` runs exactly this (2 nodes + Redis + nginx) locally.

## 3. Load math (70–80 crore)

Assume **80 crore registered**, conservative engagement:

| Metric | Value | Note |
|---|---|---|
| Daily active | ~16 cr (20%) | |
| Peak concurrent *helpers online* | ~80 lakh (5% of DAU) | volunteers stay in "ready" mode |
| SOS events | ~100–500/min at national peak | emergencies are rare per capita |
| Location beacons | helpers emit **only on >15 m move or >10 s** (hysteresis, client) → ~5–10 lakh msg/s | the single biggest saver |
| Matching work | each SOS = 1 geo query (bbox pre-filter + haversine) | **< 5 ms** per node (measured: p95 in load test) |

Per node (measured here, 1 CPU, Node 22): **1000-helper pool, 25 sequential
SOS → 0 failures, p95 ≈ a few tens of ms** (`npm run test:load`). So:

- **1 node ≈ 100k–1M concurrent helpers** with headroom (Redis GEO is O(1)
  range query; bbox pre-filter keeps the in-memory mode fast too).
- 80 lakh helpers ÷ 5 lakh/node ≈ **~2–4 nodes** for helpers alone.
- SOS path is trivial (hundreds/s) — the *same* nodes handle it.
- Real national deployment: **3 regions** (North/Central/South) × 3–5 nodes +
  Redis per region; a user is matched only against helpers in their own
  region (500 m never crosses regions).

## 4. Geo matching

- **In-memory (single node):** bbox pre-filter (cheap trig) → haversine
  (accurate). Fast to ~100k helpers/node.
- **Production (multi-node):** Redis `GEOADD` on every beacon, `GEOSEARCH
  BYCIRCLE 500` per SOS. Sub-millisecond, shared across all nodes.
  (The adapter switch is one env var: `REDIS_URL` — the Socket.IO
  redis-adapter is already wired in `server/index.js`.)
- Freshness: locations older than 90 s are ineligible; 30 s watchdog reaps
  dead entries.

## 5. Call path (privacy-critical)

```
SOS node ──'matched'──▶ both phones
both phones ⇄ WebRTC (DTLS-SRTP encrypted audio, Opus)
        ⇅ STUN (free) for NAT traversal; TURN (coturn) only if STUN fails
signalling (SDP/ICE) + chat + subtitles + peer-location
        └── relayed by the node, size-capped, rate-limited
```
The media **never touches our servers** — only tiny signalling packets do.

## 6. Free-tier map at national scale

| Component | Free option | Limit that matters |
|---|---|---|
| Static hosting | Cloudflare Pages / GitHub Pages + CDN | 500 GB/mo egress (enough: app ~200 KB) |
| Compute | Oracle Cloud **Always Free** (4 AMD + 24 GB, or 4 ARM + 64 GB) | 2 VMs free, always on |
| Redis | Same Always Free VM (or free tier on Render/Upstash 256 GB writes) | scale by sharding regions |
| LB | nginx on the same VM / MetalLB on k3s | — |
| Push | Web Push (browsers, unlimited free) + **FCM free tier** (native) | FCM is effectively unlimited |
| Translation | MyMemory free (50k chars/IP/day) → **self-hosted OPUS-MT/NLLB** (free, one always-free GPU/CPU VM) | self-host = unlimited |
| Maps | OSM tiles free; at scale self-host **tileserver-gl** on the same VM + per-region tile cache | — |
| TURN | coturn self-hosted (free) | only a fraction of calls need it |

**Total monthly infrastructure cost at national scale: ₹0** (free tiers) —
the honest caveat: real-world reliability may later justify paying for
backup VMs, but the *architecture* costs nothing.

## 7. Self-healing (काय problem आली तरी auto-solve)

| Failure | Auto-response (already in code) |
|---|---|
| User network drops mid-search | offline SOS **queued in localStorage**, auto-sent on reconnect; UI pushes 112 immediately |
| Socket disconnect | Socket.IO reconnect (backoff) + **state resume** (role/ready/lang re-announced, beacon re-sent, queued SOS flushed) |
| Call ICE fails | **automatic ICE restart** (one retry) with UI state |
| Location watch dies (phone GPS hiccup) | client **watchdog re-arms watch** after 45 s silence |
| Map tile server down | **tile failover** OSM → CARTO (free) |
| Translation provider down | **failover chain** MyMemory → Lingva → English-bridge → graceful "(original)" |
| Crashed helper in pool | 30 s **watchdog reaps** stale entries (90 s freshness + 2×) |
| Rate-limit memory growth | token buckets **pruned** every 30 s |
| Node crash | error containment → >30 fatal errors/60 s → exit → **supervisor (docker/pm2/systemd) restarts** |
| Node unhealthy in LB | nginx `max_fails=3 fail_timeout=15s` → traffic shifts to healthy node |
| Bad input / flood | per-event token buckets + per-IP connection flood guard + strict validators (see SECURITY.md) |

## 8. Regional roll-out plan

1. **Pilot:** 1 city (e.g., Sholapur) — 1 node, free Oracle VM.
2. **State:** 1–2 nodes + Redis per state, volunteers organized by ward.
3. **National:** 3 regions × 3–5 nodes; region = natural data partition
   (500 m radius never crosses regions; no cross-region data movement).
4. **Sustaining volunteers:** civic/NGO onboarding, school & panchayat
   awareness (the app's coverage *is* its scale — tech scales easily,
   volunteers are the growth engine).
