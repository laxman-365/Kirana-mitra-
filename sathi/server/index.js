/**
 * Sathi (साथी) — safety server
 * Express + Socket.IO
 *
 * Responsibilities:
 *  - Keep a live pool of "ready helpers" (sathis) with their fresh location.
 *  - When an SOS comes in, pick a RANDOM helper within 500 m (expanding to
 *    1 km, then 2.5 km if nobody is around) and create an anonymous pair.
 *  - Relay WebRTC signalling (SDP/ICE) and live location between the pair.
 *  - No phone numbers or identities ever pass through the server —
 *    only random session ids and coordinates.
 */
'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const LEAFLET_DIR = path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist');

const FRESH_MS = 90_000;        // helper location must be < 90 s old to match
const NO_ANSWER_MS = 25_000;    // helper must answer within 25 s
const RINGS = [500, 1000, 2500]; // search radii in meters

const app = express();
app.use(express.static(PUBLIC_DIR));
app.use('/leaflet', express.static(LEAFLET_DIR));
app.get('/healthz', (_req, res) => res.json({ ok: true, t: Date.now() }));

const server = http.createServer(app);
const io = new Server(server, { serveClient: true });

/** helpers: socketId -> { lat, lng, ts } */
const helpers = new Map();
/** pairs: pairId -> { pairId, sosSid, helperSid, distance, createdAt, noAnswerTimer } */
const pairs = new Map();

/* ---------------- geometry ---------------- */
function distM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const r = (x) => (x * Math.PI) / 180;
  const dLat = r(lat2 - lat1);
  const dLon = r(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const valid = (o) =>
  o && typeof o.lat === 'number' && typeof o.lng === 'number' &&
  Number.isFinite(o.lat) && Number.isFinite(o.lng) &&
  Math.abs(o.lat) <= 90 && Math.abs(o.lng) <= 180;

function helpersWithin(lat, lng, radiusM) {
  const out = [];
  for (const [sid, h] of helpers) {
    if (Date.now() - h.ts > FRESH_MS) continue;
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
    helpers.set(pair.helperSid, {
      lat: hSock.data.lastLoc.lat,
      lng: hSock.data.lastLoc.lng,
      ts: Date.now(),
    });
  }
}

/* ---------------- sockets ---------------- */
io.on('connection', (socket) => {
  socket.data = { role: null, readyFlag: false, lastLoc: null };

  socket.on('hello', (data) => {
    if (data && (data.role === 'sos' || data.role === 'helper')) socket.data.role = data.role;
    if (data && typeof data.lang === 'string' && data.lang) socket.data.lang = data.lang.slice(0, 8);
  });

  socket.on('loc', (data) => {
    if (!valid(data)) return;
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

  socket.on('ready', (data) => {
    if (data && data.on === true && valid(data)) {
      socket.data.readyFlag = true;
      helpers.set(socket.id, { lat: data.lat, lng: data.lng, ts: Date.now() });
    } else {
      socket.data.readyFlag = false;
      helpers.delete(socket.id);
    }
  });

  socket.on('nearby-count', (data) => {
    if (!valid(data)) return;
    socket.emit('nearby-count', { count: helpersWithin(data.lat, data.lng, 500).length });
  });

  socket.on('sos', (data) => {
    if (!valid(data) || pairOf(socket.id)) return;
    let pool = [];
    let ring = 500;
    for (const r of RINGS) {
      pool = helpersWithin(data.lat, data.lng, r);
      if (pool.length) { ring = r; break; }
      socket.emit('search-ring', { ring: r });
    }
    if (!pool.length) {
      socket.emit('no-helpers', {});
      return;
    }
    // pick a RANDOM helper from the eligible pool
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const pairId = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    helpers.delete(pick.sid); // remove from pool while in a call
    const pair = {
      pairId,
      sosSid: socket.id,
      helperSid: pick.sid,
      distance: Math.round(pick.d),
      createdAt: Date.now(),
      noAnswerTimer: setTimeout(() => dissolve(pairId, 'no-answer'), NO_ANSWER_MS),
    };
    pairs.set(pairId, pair);

    io.to(socket.id).emit('matched', {
      pairId,
      role: 'sos',
      distance: pair.distance,
      otherLabel: 'Sathi #' + (1000 + Math.floor(Math.random() * 9000)),
      otherLang: (io.sockets.sockets.get(pick.sid) || {}).data?.lang || 'en',
    });
    io.to(pick.sid).emit('matched', {
      pairId,
      role: 'helper',
      distance: pair.distance,
      sos: { lat: data.lat, lng: data.lng },
      otherLang: socket.data.lang || 'en',
    });
  });

  socket.on('rtc', (msg) => {
    const pair = pairs.get(msg && msg.pairId);
    if (!pair) return;
    const other =
      pair.sosSid === socket.id ? pair.helperSid :
      pair.helperSid === socket.id ? pair.sosSid : null;
    if (other) io.to(other).emit('rtc', { pairId: pair.pairId, data: msg.data });
  });

  // relay translated-agnostic text: chat + live voice subtitles
  for (const ev of ['chat', 'speech']) {
    socket.on(ev, (msg) => {
      const pair = pairs.get(msg && msg.pairId);
      if (!pair) return;
      const other =
        pair.sosSid === socket.id ? pair.helperSid :
        pair.helperSid === socket.id ? pair.sosSid : null;
      if (!other) return;
      const text = typeof msg.text === 'string' ? msg.text.slice(0, 500) : '';
      if (!text.trim()) return;
      io.to(other).emit(ev, {
        pairId: pair.pairId,
        text,
        from: pair.sosSid === socket.id ? 'sos' : 'helper',
      });
    });
  }

  socket.on('decline', (msg) => {
    if (msg && msg.pairId) dissolve(msg.pairId, 'declined');
  });

  socket.on('end-call', (msg) => {
    if (msg && msg.pairId) dissolve(msg.pairId, 'ended');
  });

  socket.on('disconnect', () => {
    socket.data.readyFlag = false;
    helpers.delete(socket.id);
    const pair = pairOf(socket.id);
    if (pair) dissolve(pair.pairId, 'left');
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Sathi (साथी) server running on http://0.0.0.0:${PORT}`);
});
