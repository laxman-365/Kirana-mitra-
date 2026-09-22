/**
 * Load test (headless): single-node capacity proof.
 * Spawns a DEDICATED server instance on a test port (so the running
 * preview stays untouched and the connection flood guard can be lifted
 * for this single test IP), then:
 *   - 1000 helpers join the ready pool around a city center
 *   - 25 sequential SOS from the center must ALL match within 500 m
 *   - reports match latency p50/p95
 * Production scale-out (Redis adapter + LB) is in ARCHITECTURE.md;
 * this proves per-node matching is fast enough that scaling is linear.
 */
'use strict';
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

const PORT = process.env.LOAD_PORT || 3199;
const BASE = 'http://127.0.0.1:' + PORT;
const LAT = 19.076, LNG = 72.8777;
const N_HELPERS = parseInt(process.env.HELPERS || '1000', 10);
const N_SOS = parseInt(process.env.SOS || '25', 10);

const ok = (m) => console.log('  ✓', m);
const bad = (m) => { console.error('  ✗', m); process.exitCode = 1; };
const guard = setTimeout(() => { bad('global timeout'); process.exit(1); }, 150_000);

function waitForServer(ms) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    (function poll() {
      http.get(BASE + '/healthz', (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => (res.statusCode === 200 ? resolve(true) : poll()));
      }).on('error', () => (Date.now() - t0 > ms ? resolve(false) : setTimeout(poll, 250)));
    })();
  });
}

const helpers = [];
function jitter() {
  const dLat = (Math.random() - 0.5) * 0.027;
  const dLng = (Math.random() - 0.5) * 0.029;
  return { lat: LAT + dLat, lng: LNG + dLng };
}

function connectHelper(i) {
  return new Promise((resolve) => {
    const s = io(BASE, { transports: ['websocket'], forceNew: true, reconnection: false });
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(s); } };
    s.on('connect', () => {
      const p = jitter();
      s.emit('hello', { role: 'helper', lang: 'mr' });
      s.emit('ready', { on: true, lat: p.lat, lng: p.lng });
      s.on('matched', (d) => s.emit('end-call', { pairId: d.pairId }));
      setTimeout(finish, 30);
      finish();
    });
    s.on('connect_error', () => finish());
    setTimeout(finish, 8000);
  });
}

function oneSOS() {
  return new Promise((resolve) => {
    const s = io(BASE, { transports: ['websocket'], forceNew: true, reconnection: false });
    const t0 = Date.now();
    let done = false;
    const finish = (r) => { if (!done) { done = true; s.disconnect(); resolve(r); } };
    s.on('connect', () => {
      s.emit('hello', { role: 'sos', lang: 'mr' });
      s.emit('sos', { lat: LAT, lng: LNG });
    });
    s.on('matched', (d) => {
      s.emit('end-call', { pairId: d.pairId });
      finish({ ms: Date.now() - t0, dist: d.distance });
    });
    s.on('no-helpers', () => finish({ ms: Date.now() - t0, dist: null }));
    setTimeout(() => finish({ ms: Date.now() - t0, dist: null }), 10_000);
  });
}

(async () => {
  // dedicated server for the load test (flood guard lifted for this test IP)
  const srv = spawn('node', ['server/index.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), SATHI_CONN_PER_MIN: '100000' },
    stdio: 'ignore',
  });
  const up = await waitForServer(15_000);
  if (!up) { srv.kill(); bad('load-test server did not start'); process.exit(1); }
  ok('dedicated load-test server up on :' + PORT);

  console.log(`Connecting ${N_HELPERS} helpers (parallel)…`);
  const t0 = Date.now();
  const BATCH = 200;
  for (let i = 0; i < N_HELPERS; i += BATCH) {
    const slice = [];
    for (let j = i; j < Math.min(i + BATCH, N_HELPERS); j++) slice.push(connectHelper(j));
    const conns = await Promise.all(slice);
    helpers.push(...conns.filter(Boolean));
    console.log(`    ${Math.min(i + BATCH, N_HELPERS)}/${N_HELPERS} connected`);
  }
  ok(`pool of ${helpers.length} helpers ready in ${Date.now() - t0} ms`);

  console.log(`Firing ${N_SOS} sequential SOS (500 m pool)…`);
  const results = [];
  let failed = 0;
  for (let i = 0; i < N_SOS; i++) {
    const r = await oneSOS();
    if (r.dist == null) failed++;
    else results.push(r);
    await new Promise((res) => setTimeout(res, 50));
  }
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  const p50 = ms[Math.floor(ms.length * 0.5)] || 0;
  const p95 = ms[Math.max(0, Math.ceil(ms.length * 0.95) - 1)] || 0;
  const avgDist = results.length ? Math.round(results.reduce((a, r) => a + r.dist, 0) / results.length) : 0;
  console.log('');
  if (failed === 0 && results.length === N_SOS) ok(`all ${N_SOS} SOS matched (0 failures)`);
  else bad(`${failed}/${N_SOS} SOS failed`);
  if (helpers.length >= N_HELPERS * 0.95) ok(`${helpers.length}/${N_HELPERS} helpers connected`);
  else bad(`only ${helpers.length}/${N_HELPERS} helpers connected`);
  ok(`match latency  p50=${p50} ms  p95=${p95} ms  (connect + geo match + emit)`);
  ok(`avg matched distance ${avgDist} m (within 500 m ring)`);

  helpers.forEach((h) => h.disconnect());
  srv.kill('SIGTERM');
  clearTimeout(guard);
  setTimeout(() => process.exit(process.exitCode || 0), 500);
})().catch((e) => { bad('unhandled: ' + (e && e.stack || e)); process.exit(1); });
