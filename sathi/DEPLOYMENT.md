# Sathi (साथी) — Deployment (Free-first, self-healing)

## A. Single node (start here) — free

### Option 1: this sandbox / any Linux machine
```bash
cd sathi
npm ci --omit=dev
SATHI_PROD=1 ADMIN_TOKEN=secret npm start
```

### Option 2: Render / Railway / Glitch (free tier, 5 min)
1. Push this repo to GitHub.
2. Render → **New Web Service** → repo → build `npm ci --omit=dev` →
   start `SATHI_PROD=1 node server/index.js` → env: `ADMIN_TOKEN`.
3. Copy the free HTTPS URL to phones. Done.

### Option 3: Oracle Cloud Always Free (always-on, national pilot)
1. Free tier: 1 AMD VM (4 CPU/24 GB) or 2 ARM (4 CPU/64 GB).
2. Install Node 22 (`curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt i nodejs`).
3. `git clone` → `npm ci --omit=dev` → systemd unit (below).
4. Point a free domain (or the VM IP) via Caddy (auto-Let's-Encrypt)
   or nginx + certbot. WebRTC **requires HTTPS**.

**systemd unit** (`/etc/systemd/system/sathi.service`) — self-healing:
```ini
[Unit]
Description=Sathi safety server
After=network-online.target

[Service]
WorkingDirectory=/opt/sathi
Environment=SATHI_PROD=1
Environment=ADMIN_TOKEN=__SET_ME__
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3
WatchdogSec=60

[Install]
WantedBy=multi-user.target
```

## B. Full-scale stack — `docker compose up -d`

```
nginx (LB, ws upgrade) → sathi-1 + sathi-2 (stateless) → Redis (shared state)
```
Exactly the production topology, one command. Scale out = duplicate a
`sathi-N` service. Multi-region = 3 of these stacks (one per region),
each with its own Redis.

## C. Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PORT` | 3000 | listen port |
| `REDIS_URL` | (unset) | set → multi-node mode (redis-adapter) |
| `SATHI_PROD` | 0 | `1` → strict CSP (frame-ancestors 'none') + long static cache |
| `ADMIN_TOKEN` | (unset) | gates `/api/audit` (unset = disabled) |

## D. Operations

| Task | Command |
|---|---|
| Health | `curl /healthz` (helpers, pairs, uptime) |
| Metrics (Prometheus text) | `curl /metrics` |
| Audit tail (last 500) | `curl '/api/audit?token=$ADMIN_TOKEN'` |
| Self-test suite | `npm test` (functional + security, headless) |
| Load test (1000 helpers) | `npm run test:load` |
| Rotate push keys | `rm keys/vapid.json && restart` |
| Zero backups needed | no database — state is ephemeral by design |

**Self-healing guarantees:** docker/pm2/systemd `restart: always` + server
error-containment (exits only on >30 fatal errors/min so the supervisor
takes over) + nginx `max_fails` failover + client auto-reconnect/offline
queue. A problem that appears at 3 am solves itself without a human.

## E. Roll-out (free)

| Stage | Infra | Users covered |
|---|---|---|
| Pilot city | 1 Render free VM (or sandbox) | ward volunteers |
| State | Oracle free VM (2 ARM) + nginx | ~5–20 lakh helpers |
| National | 3 regions × (2–4 free VMs) + free CDN for static | 70–80 cr |
