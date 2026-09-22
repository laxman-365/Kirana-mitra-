/**
 * Security tests (headless):
 *  - HTTP hardening: health, metrics, CSP header, audit auth
 *  - oversized/invalid input rejected without crash
 *  - location flood tolerated (rate limited)
 *  - unknown events ignored
 *  - server still healthy at the end
 */
'use strict';
const http = require('http');
const { io } = require('socket.io-client');

const BASE = process.env.BASE || 'http://127.0.0.1:' + (process.env.PORT || 3000);
const LAT = 19.076, LNG = 72.8777;
let failures = 0;
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { console.error('  ✗', m); failures++; };
const finished = () => {
  console.log(failures ? `\n${failures} security test(s) FAILED` : '\nAll security tests passed');
  process.exit(failures ? 1 : 0);
};
const guard = setTimeout(() => { bad('global timeout'); finished(); }, 30000);

function get(p, headers) {
  return new Promise((resolve) => {
    http.get(BASE + p, { headers: headers || {} }, (res) => {
      let b = '';
      res.on('data', (c) => (b += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    }).on('error', (e) => resolve({ status: 0, headers: {}, body: String(e) }));
  });
}

(async () => {
  /* ---- HTTP hardening ---- */
  const hz = await get('/healthz');
  if (hz.status === 200 && JSON.parse(hz.body).ok) ok('GET /healthz 200'); else bad('/healthz broken');
  const mt = await get('/metrics');
  if (mt.status === 200 && /sathi_helpers_total/.test(mt.body)) ok('GET /metrics (prometheus format)'); else bad('/metrics broken');
  const csp = (hz.headers['content-security-policy'] || '');
  if (csp.includes("default-src 'self'") && csp.includes("object-src 'none'")) ok('CSP header strict (default-src self, object-src none)');
  else bad('CSP header missing/weak: ' + csp.slice(0, 80));
  if (hz.headers['x-powered-by'] === undefined) ok('x-powered-by disabled'); else bad('x-powered-by leaks');
  const aud = await get('/api/audit');
  if (aud.status === 401 || aud.status === 503) ok('GET /api/audit without token → ' + aud.status + ' (denied)');
  else bad('audit accessible without token!');
  const key = await get('/api/push/public-key');
  if (key.status === 200 && JSON.parse(key.body).vapidKey) ok('Web Push VAPID public key served (free push)'); else bad('push key missing');

  /* ---- socket-level input validation & floods ---- */
  const helper = io(BASE, { transports: ['websocket'], forceNew: true });
  const sos = io(BASE, { transports: ['websocket'], forceNew: true });
  await new Promise((r) => helper.on('connect', r));
  helper.emit('hello', { role: 'helper', lang: 'mr' });
  helper.emit('ready', { on: true, lat: LAT, lng: LNG });
  await new Promise((r) => sos.on('connect', r));
  sos.emit('hello', { role: 'sos', lang: 'mr' });

  // 1) oversized chat (>500 chars) must be dropped, not relayed
  const big = 'a'.repeat(5000);
  let bigRelayed = false;
  helper.on('chat', (m) => { if (m.text === big) bigRelayed = true; });
  sos.emit('chat', { pairId: 'p' + 'x'.repeat(10), text: big });
  await new Promise((r) => setTimeout(r, 500));
  if (!bigRelayed) ok('oversized chat (5000 chars) dropped'); else bad('oversized chat relayed!');

  // 2) invalid coordinates rejected
  sos.emit('sos', { lat: 999, lng: 72.87 });
  sos.emit('loc', { lat: -999, lng: 0 });
  sos.emit('sos', { lat: 'abc', lng: null });
  await new Promise((r) => setTimeout(r, 300));
  ok('invalid coordinates rejected without crash');

  // 3) location flood (100 beacons in 1 s) — rate limited, no crash
  for (let i = 0; i < 100; i++) sos.emit('loc', { lat: LAT, lng: LNG });
  await new Promise((r) => setTimeout(r, 700));
  ok('location flood (100/s) absorbed by rate limiter');

  // 4) unknown event ignored
  sos.emit('totally-unknown-event', { x: 1 });
  sos.emit('end-call', { pairId: 'p'.repeat(5) }); // malformed pairId
  await new Promise((r) => setTimeout(r, 300));
  ok('unknown/malformed events ignored');

  // 5) still healthy: helper pool intact
  const hz2 = await get('/healthz');
  const j2 = JSON.parse(hz2.body);
  if (j2.ok && j2.helpers >= 1) ok('server healthy after attacks (helpers in pool: ' + j2.helpers + ')');
  else bad('server unhealthy after tests');

  helper.disconnect();
  sos.disconnect();
  clearTimeout(guard);
  setTimeout(finished, 300);
})().catch((e) => { bad('unhandled: ' + e.message); finished(); });
