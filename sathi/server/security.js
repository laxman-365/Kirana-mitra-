'use strict';
/* ============================================================
   security.js — advanced hardening layer
   - token-bucket rate limiters (per socket, per event)
   - per-IP connection flood limiter
   - input validators (strict, size-capped)
   - in-memory audit ring buffer (exportable, no PII)
   - metrics counters
   ============================================================ */

class TokenBucket {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
  }
  /** returns true if allowed */
  hit(key) {
    const now = Date.now();
    let b = this.hits.get(key);
    if (!b || now - b.start >= this.windowMs) {
      b = { start: now, n: 0 };
      this.hits.set(key, b);
    }
    b.n += 1;
    if (b.n > this.limit * 100) this.hits.delete(key); // safety: drop ancient keys
    return b.n <= this.limit;
  }
  // prune old buckets periodically
  prune() {
    const now = Date.now();
    for (const [k, b] of this.hits) if (now - b.start >= this.windowMs) this.hits.delete(k);
  }
}

const limiters = {
  // SOS: max 3 per minute per socket (anti-spam, real emergencies retry <= 3)
  sos: new TokenBucket(3, 60_000),
  // location beacons: max 2 per second
  loc: new TokenBucket(2, 1_000),
  // text (chat + subtitles): max 12 per minute
  chat: new TokenBucket(12, 60_000),
  // nearby count polling: 10 per 30 s
  nearby: new TokenBucket(10, 30_000),
  // ready toggles: 6 per minute
  ready: new TokenBucket(6, 60_000),
  // rtc signalling: 120 per second (ICE floods are normal)
  rtc: new TokenBucket(120, 1_000),
  // push subscription: 5 per minute
  pushSub: new TokenBucket(5, 60_000),
};

// per-IP connection flood (handshakes) — lenient for CGNAT (thousands of
// phones share one IP); raise/lower per deployment via SATHI_CONN_PER_MIN
const ipConn = new TokenBucket(parseInt(process.env.SATHI_CONN_PER_MIN || '60', 10), 60_000);

/* ---------------- validators ---------------- */
function validPoint(o) {
  return !!o && typeof o.lat === 'number' && typeof o.lng === 'number' &&
    Number.isFinite(o.lat) && Number.isFinite(o.lng) &&
    Math.abs(o.lat) <= 90 && Math.abs(o.lng) <= 180;
}
function validText(t) {
  return typeof t === 'string' && t.length > 0 && t.length <= 500;
}
function validPairId(p) {
  return typeof p === 'string' && /^p[0-9a-z]{4,20}$/.test(p);
}
function validRole(r) {
  return r === 'sos' || r === 'helper';
}
function validLang(l) {
  return typeof l === 'string' && /^[a-z]{2,4}(-[A-Z]{2})?$/.test(l) && l.length <= 8;
}

/* ---------------- audit ring (no PII: ip + event type + detail) ---------------- */
const audit = [];
const AUDIT_MAX = 5000;
function logAudit(type, ip, detail) {
  audit.push({ t: Date.now(), type, ip: ip || '-', d: String(detail == null ? '' : detail).slice(0, 120) });
  if (audit.length > AUDIT_MAX) audit.splice(0, audit.length - AUDIT_MAX);
}
function auditTail(n = 500) {
  return audit.slice(-n);
}

/* ---------------- metrics ---------------- */
const metrics = {
  sosTotal: 0,
  matchTotal: 0,
  noHelpersTotal: 0,
  matchDurSumMs: 0,
  matchDurN: 0,
  rateLimitedTotal: 0,
  startedAt: Date.now(),
};
function metricMatchDuration(ms) {
  metrics.matchDurSumMs += ms;
  metrics.matchDurN += 1;
}

module.exports = {
  TokenBucket,
  limiters,
  ipConn,
  validPoint,
  validText,
  validPairId,
  validRole,
  validLang,
  logAudit,
  auditTail,
  metrics,
  metricMatchDuration,
};
