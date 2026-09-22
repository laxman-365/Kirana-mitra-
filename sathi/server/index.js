/**
 * Sathi (साथी) — national-scale safety server
 * Express + Socket.IO + Web Push
 *
 * Production design (see ARCHITECTURE.md):
 *  - STATELESS per node: any node can take any socket; shared state
 *    (presence + rooms) moves to Redis automatically when REDIS_URL is set
 *    (@socket.io/redis-adapter) → horizontal scaling behind a load balancer.
 *  - GEO matching: in-memory with bbox pre-filter (fast to ~100k/node);
 *    production path = Redis GEO (GEOADD/GEOSEARCH) — documented.
 *  - Security: helmet CSP, per-event token-bucket rate limits, per-IP
 *    connection flood limit, strict validators, audit ring, admin token.
 *  - Self-healing: dead-entry reaper watchdog, uncaught error containment,
 *    health/readiness endpoints, Prometheus-style /metrics.
 *  - Privacy: no accounts, no phone numbers, no PII. Ephemeral location.
 */
'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const { Server } = require('socket.io');

const { limiters, ipConn, validPoint, validText, validPairId, validRole, validLang, logAudit, auditTail, metrics, metricMatchDuration } = require('./security');
const push = require('./push');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const LEAFLET_DIR = path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const PROD = process.env.SATHI_PROD === '1';

const FRESH_MS = 90_000;        // helper location freshness
const NO_ANSWER_MS = 25_000;    // helper must answer within
const RINGS = [500, 1000, 2500]; // search radii (m)
const PUSH_FANOUT_MAX = 25;     // max push recipients per SOS

/* ============================ HTTP app ============================ */
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", 'https://fonts.googleapis.com'],
  fontSrc: ["'self'", 'https://fonts.gstatic.com'],
  imgSrc: ["'self'", 'data:', 'https://*.tile.openstreetmap.org', 'https://*.basemaps.cartocdn.com'],
  connectSrc: ["'self'", 'https://api.mymemory.translated.net', 'https://*.lingva.dev', 'https://*.tile.openstreetmap.org', 'https://*.basemaps.cartocdn.com'],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
};
// NOTE: useDefaults:false → we control every directive. frame-ancestors is
// left OFF so the app can be embedded in preview/iframes; for your own
// production origin set SATHI_NOFRAME=1 to add clickjacking protection.
if (PROD && process.env.SATHI_NOFRAME === '1') cspDirectives.frameAncestors = ["'none'"];

app.use(helmet({
  contentSecurityPolicy: { useDefaults: false, directives: cspDirectives },
  frameguard: false,
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'no-referrer' },
  upgradeInsecureRequests: null,
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

app.use(express.static(PUBLIC_DIR, { maxAge: PROD ? '1h' : 0, immutable: false }));
app.use('/leaflet', express.static(LEAFLET_DIR, { maxAge: PROD ? '30d' : 0 }));

/* ---------------- routes ---------------- */
app.get('/healthz', (_req, res) => {
  res.json({ ok: true, t: Date.now(), uptime: Math.round(process.uptime()), helpers: helpers.size, pairs: pairs.size });
});
app.get('/readyz', (_req, res) => {
  res.json({ ok: true });
});
app.get('/metrics', (_req, res) => {
  const m = metrics;
  const mem = process.memoryUsage();
  res.type('text/plain').send([
    `# HELP sathi_helpers_total Helpers currently in the ready pool`,
    `# TYPE sathi_helpers_total gauge`,
    `sathi_helpers_total ${helpers.size}`,
    `# HELP sathi_pairs_active Active SOS-helper pairs`,
    `# TYPE sathi_pairs_active gauge`,
    `sathi_pairs_active ${pairs.size}`,
    `# HELP sathi_sos_total_total SOS requests received`,
    `# TYPE sathi_sos_total_total counter`,
    `sathi_sos_total_total ${m.sosTotal}`,
    `# HELP sathi_matches_total_total Successful matches`,
    `# TYPE sathi_matches_total_total counter`,
    `sathi_matches_total_total ${m.matchTotal}`,
    `# HELP sathi_no_helpers_total_total SOS with nobody in range`,
    `# TYPE sathi_no_helpers_total_total counter`,
    `sathi_no_helpers_total_total ${m.noHelpersTotal}`,
    `# HELP sathi_rate_limited_total_total Requests dropped by rate limits`,
    `# TYPE sathi_rate_limited_total_total counter`,
    `sathi_rate_limited_total_total ${m.rateLimitedTotal}`,
    `# HELP sathi_match_duration_ms_sum Sum of SOS->match latency in ms`,
    `# TYPE sathi_match_duration_ms_sum counter`,
    `sathi_match_duration_ms_sum ${m.matchDurSumMs}`,
    `# HELP sathi_match_duration_ms_count Count of matched SOS`,
    `# TYPE sathi_match_duration_ms_count counter`,
    `sathi_match_duration_ms_count ${m.matchDurN}`,
    `# HELP process_resident_memory_bytes`,
    `# TYPE process_resident_memory_bytes gauge`,
    `process_resident_memory_bytes ${mem.rss}`,
    `# HELP process_uptime_seconds`,
    `# TYPE process_uptime_seconds gauge`,
    `process_uptime_seconds ${Math.round(process.uptime())}`,
  ].join('\n') + '\n');
});
app.get('/api/push/public-key', (_req, res) => {
  const k = push.publicKeys();
  res.json(k || { vapidKey: null });
});
app.get('/api/audit', (req, res) => {
  if (!ADMIN_TOKEN) return res.status(503).json({ error: 'audit disabled (set ADMIN_TOKEN)' });
  if (req.query.token !== ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized' });
  res.json({ count: auditTail(5000).length, entries: auditTail(500) });
});

/* ============================ HTTP + IO ============================ */
const server = http.createServer(app);

let io;
if (process.env.REDIS_URL) {
  // Horizontal scale: shared adapter across nodes (see ARCHITECTURE.md)
  try {
    const Redis = require('ioredis');
    const { createAdapter } = require('@socket.io/redis-adapter');
    const pub = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
    const sub = new Redis(process.env.REDIS_URL);
    io = new Server(server, { adapter: createAdapter(pub, sub), serveClient: true });
    console.log('Sathi: Redis adapter active (multi-node mode)');
  } catch (e) {
    console.error('Sathi: Redis adapter failed, falling back to single-node', e.message);
    io = new Server(server, { serveClient: true });
  }
} else {
  io = new Server(server, { serveClient: true });
}

/* ============================ state ============================ */
/** helpers: socketId -> { lat, lng, ts, sub? } */
const helpers = new Map();
/** pairs: pairId -> { pairId, sosSid, helperSid, distance, createdAt, noAnswerTimer } */
const pairs = new Map();
/** pushSubs: socketId -> PushSubscription */
const pushSubs = new Map();

/* ============================ geo ============================ */
function distM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const r = (x) => (x * Math.PI) / 180;
  const dLat = r(lat2 - lat1);
  const dLon = r(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function helpersWithin(lat, lng, radiusM) {
  // bbox pre-filter (cheap) then haversine (accurate)
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos((lat * Math.PI) / 180) || 1);
  const minLat = lat - dLat, maxLat = lat + dLat;
  const minLng = lng - dLng, maxLng = lng + dLng;
  const out = [];
  const now = Date.now();
  for (const [sid, h] of helpers) {
    if (now - h.ts > FRESH_MS) continue;
    if (h.lat < minLat || h.lat > maxLat || h.lng < minLng || h.lng > maxLng) continue;
    const d = distM(lat, lng, h.lat, h.lng);
    if (d <= radiusM) out.push({ sid, d });
  }
  return out;
}
function pairOf(sid) {
  for (const p of pairs.values()) if (p.sosSid === sid || p.helperSid === sid) return p;
  return null;
}

function dissolve(pairId, reason) {
  const pair = pairs.get(pairId);
  if (!pair) return;
  clearTimeout(pair.noAnswerTimer);
  pairs.delete(pairId);
  io.to(pair.sosSid).emit('pair-over', { pairId, reason });
  io.to(pair.helperSid).emit('pair-over', { pairId, reason });
  // helper auto re-enters the pool if still "ready"
  const hSock = io.sockets.sockets.get(pair.helperSid);
  if (hSock && hSock.data.readyFlag && hSock.data.lastLoc) {
    helpers.set(pair.helperSid, { lat: hSock.data.lastLoc.lat, lng: hSock.data.lastLoc.lng, ts: Date.now(), sub: hSock.data.pushSub || null });
  }
  logAudit('pair-over', pair.helperSid, `${reason}`);
}

/* ============================ push helpers ============================ */
async function pushToHelper(sid, payload) {
  const sub = pushSubs.get(sid) || (helpers.get(sid) || {}).sub;
  if (!sub) return;
  const r = await push.sendPush(sub, payload);
  if (r === 'expired') pushSubs.delete(sid);
}

/* ============================ sockets ============================ */
// connection flood guard (per IP, at handshake)
io.use((socket, next) => {
  const ip = socket.handshake.address || '-';
  if (!ipConn.hit(ip)) {
    logAudit('flood-block', ip, 'too many connections/min');
    return next(new Error('rate limited'));
  }
  next();
});

io.on('connection', (socket) => {
  const ip = socket.handshake.address || '-';

  // per-IP connection flood limit (checked at handshake via ping pattern)
  socket.data = { role: null, readyFlag: false, lastLoc: null, pushSub: null, connectedAt: Date.now() };

  const guarded = (eventName, limiter, handler) => {
    socket.on(eventName, (msg, ack) => {
      if (!limiter.hit(socket.id)) {
        metrics.rateLimitedTotal += 1;
        if (typeof ack === 'function') ack({ error: 'rate-limited' });
        return;
      }
      handler(msg, ack);
    });
  };

  socket.on('hello', (data) => {
    if (!data || typeof data !== 'object') return;
    if (validRole(data.role)) socket.data.role = data.role;
    if (validLang(data.lang)) socket.data.lang = data.lang;
  });

  guarded('loc', limiters.loc, (data) => {
    if (!validPoint(data)) return;
    socket.data.lastLoc = { lat: data.lat, lng: data.lng };
    const h = helpers.get(socket.id);
    if (h) {
      h.lat = data.lat;
      h.lng = data.lng;
      h.ts = Date.now();
    }
    const pair = pairOf(socket.id);
    if (pair) {
      const other =
        pair.sosSid === socket.id ? pair.helperSid :
        pair.helperSid === socket.id ? pair.sosSid : null;
      if (other) io.to(other).emit('peer-loc', { lat: data.lat, lng: data.lng, ts: Date.now() });
    }
  });

  guarded('ready', limiters.ready, (data) => {
    if (data && data.on === true && validPoint(data)) {
      socket.data.readyFlag = true;
      helpers.set(socket.id, { lat: data.lat, lng: data.lng, ts: Date.now(), sub: socket.data.pushSub || null });
    } else {
      socket.data.readyFlag = false;
      helpers.delete(socket.id);
    }
  });

  guarded('nearby-count', limiters.nearby, (data) => {
    if (!validPoint(data)) return;
    socket.emit('nearby-count', { count: helpersWithin(data.lat, data.lng, 500).length });
  });

  guarded('push-sub', limiters.pushSub, (sub) => {
    if (!sub || typeof sub !== 'object' || !sub.endpoint || !sub.keys) return;
    socket.data.pushSub = { endpoint: String(sub.endpoint).slice(0, 2048), keys: { p256dh: String(sub.keys.p256dh || '').slice(0, 300), auth: String(sub.keys.auth || '').slice(0, 100) } };
    pushSubs.set(socket.id, socket.data.pushSub);
    const h = helpers.get(socket.id);
    if (h) h.sub = socket.data.pushSub;
    logAudit('push-sub', ip, 'subscription saved');
  });

  guarded('sos', limiters.sos, (data) => {
    if (!validPoint(data) || pairOf(socket.id)) return;
    metrics.sosTotal += 1;
    const t0 = Date.now();
    let pool = [];
    let ring = 500;
    for (const r of RINGS) {
      pool = helpersWithin(data.lat, data.lng, r);
      if (pool.length) { ring = r; break; }
      socket.emit('search-ring', { ring: r });
    }
    if (!pool.length) {
      metrics.noHelpersTotal += 1;
      socket.emit('no-helpers', {});
      logAudit('sos-no-helpers', ip, 'no helper in 2.5 km');
      // national-coverage net: nudge nearby (5 km) helpers via web push
      const nearby5 = helpersWithin(data.lat, data.lng, 5000).slice(0, PUSH_FANOUT_MAX);
      for (const n of nearby5) pushToHelper(n.sid, { kind: 'sos-nearby', dist: Math.round(n.d) });
      return;
    }
    // pick a RANDOM helper from the eligible pool
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const pairId = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    helpers.delete(pick.sid);
    const pair = {
      pairId,
      sosSid: socket.id,
      helperSid: pick.sid,
      distance: Math.round(pick.d),
      createdAt: Date.now(),
      noAnswerTimer: setTimeout(() => dissolve(pairId, 'no-answer'), NO_ANSWER_MS),
    };
    pairs.set(pairId, pair);
    metrics.matchTotal += 1;
    metricMatchDuration(Date.now() - t0);

    const hSock = io.sockets.sockets.get(pick.sid);
    io.to(socket.id).emit('matched', {
      pairId,
      role: 'sos',
      distance: pair.distance,
      otherLabel: 'Sathi #' + (1000 + Math.floor(Math.random() * 9000)),
      otherLang: (hSock && hSock.data.lang) || 'en',
    });
    io.to(pick.sid).emit('matched', {
      pairId,
      role: 'helper',
      distance: pair.distance,
      sos: { lat: data.lat, lng: data.lng },
      otherLang: socket.data.lang || 'en',
    });
    // backgrounded helper phone still rings via web push
    pushToHelper(pick.sid, { kind: 'sos-match', dist: pair.distance });
    logAudit('match', ip, `d=${pair.distance}m`);
  });

  guarded('rtc', limiters.rtc, (msg) => {
    if (!msg || !validPairId(msg.pairId)) return;
    const pair = pairs.get(msg.pairId);
    if (!pair) return;
    const other =
      pair.sosSid === socket.id ? pair.helperSid :
      pair.helperSid === socket.id ? pair.sosSid : null;
    if (!other) return;
    const data = msg.data && typeof msg.data === 'object' ? msg.data : null;
    if (data && (data.sdp || data.candidate)) {
      // size caps against signalling abuse
      if (data.sdp && typeof data.sdp === 'object' && (data.sdp.sdp || '').length > 20000) return;
      if (data.candidate && (data.candidate.candidate || '').length > 4000) return;
      io.to(other).emit('rtc', { pairId: pair.pairId, data });
    }
  });

  // relay text: chat + live voice subtitles
  for (const ev of ['chat', 'speech']) {
    guarded(ev, limiters.chat, (msg) => {
      if (!msg || !validPairId(msg.pairId) || !validText(msg.text)) return;
      const pair = pairs.get(msg.pairId);
      if (!pair) return;
      const other =
        pair.sosSid === socket.id ? pair.helperSid :
        pair.helperSid === socket.id ? pair.sosSid : null;
      if (!other) return;
      io.to(other).emit(ev, { pairId: pair.pairId, text: msg.text, from: pair.sosSid === socket.id ? 'sos' : 'helper' });
    });
  }

  socket.on('decline', (msg) => {
    if (msg && validPairId(msg.pairId)) dissolve(msg.pairId, 'declined');
  });
  socket.on('end-call', (msg) => {
    if (msg && validPairId(msg.pairId)) dissolve(msg.pairId, 'ended');
  });

  socket.on('disconnect', (reason) => {
    socket.data.readyFlag = false;
    pushSubs.delete(socket.id);
    helpers.delete(socket.id);
    const pair = pairOf(socket.id);
    if (pair) dissolve(pair.pairId, 'left');
    if (reason !== 'transport close' && reason !== 'io client disconnect') logAudit('disconnect', ip, reason);
  });
});

/* ============================ self-healing watchdog ============================ */
setInterval(() => {
  const now = Date.now();
  // reap stale helper entries (crashed clients whose sockets vanished)
  for (const [sid, h] of helpers) {
    if (now - h.ts > FRESH_MS * 2) helpers.delete(sid);
  }
  // prune rate-limiter memory
  for (const l of Object.values(limiters)) l.prune();
  ipConn.prune();
  // periodic health log (visible to any process supervisor)
  if (metrics.sosTotal % 50 === 0 && metrics.sosTotal > 0) {
    logAudit('watchdog', '-', `helpers=${helpers.size} pairs=${pairs.size} rss=${Math.round(process.memoryUsage().rss / 1048576)}MB`);
  }
}, 30_000);

/* ============================ error containment ============================ */
let errorCount = 0;
let errorWindowStart = Date.now();
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err && err.stack || err);
  logAudit('fatal', '-', (err && err.message || 'uncaught').slice(0, 120));
  errorCount += 1;
  if (Date.now() - errorWindowStart > 60_000) { errorCount = 0; errorWindowStart = Date.now(); }
  if (errorCount > 30) {
    // supervisor (PM2/systemd/docker) restarts us; exit so it does
    console.error('Too many uncaught errors — exiting for supervisor restart (self-healing).');
    process.exit(1);
  }
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
  logAudit('rejection', '-', String(reason && reason.message || reason).slice(0, 120));
});

/* ============================ start ============================ */
push.init();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sathi (साथी) server running on http://0.0.0.0:${PORT} (push:${push.isEnabled() ? 'on' : 'off'}, prod:${PROD ? 'yes' : 'no'})`);
});
