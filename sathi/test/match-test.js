/**
 * Headless test of the Sathi matching core (no browser needed).
 *  1. helper tab goes ready at (19.0760, 72.8777)
 *  2. SOS at (19.0761, 72.8778) ~15 m away
 *  3. expect: both get `matched` with same pairId, small distance
 *  4. SDP offer/answer relay works
 *  5. end-call -> both get pair-over
 *  6. SOS far away with no helpers -> `no-helpers`
 */
'use strict';
const { io } = require('socket.io-client');

const BASE = 'http://127.0.0.1:' + (process.env.PORT || 3000);
const LAT = 19.076, LNG = 72.8777;
let failures = 0;
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { console.error('  ✗', m); failures++; };
const finished = () => {
  console.log(failures ? `\n${failures} test(s) FAILED` : '\nAll tests passed');
  process.exit(failures ? 1 : 0);
};
const guard = setTimeout(() => { bad('global timeout'); finished(); }, 20000);

const helper = io(BASE, { transports: ['websocket'], forceNew: true });
const sos = io(BASE, { transports: ['websocket'], forceNew: true });
const far = io(BASE, { transports: ['websocket'], forceNew: true });

const ended = { helper: false, sos: false };
const maybeFinish = () => {
  if (ended.helper && ended.sos) {
    clearTimeout(guard);
    setTimeout(finished, 300);
  }
};

helper.on('connect', () => {
  ok('helper connected');
  helper.emit('hello', { role: 'helper' });
  helper.emit('ready', { on: true, lat: LAT, lng: LNG });
});

helper.on('matched', (d) => {
  if (d.role !== 'helper') return bad('helper matched with wrong role');
  ok(`helper matched, distance=${d.distance} m, pairId=${d.pairId.slice(0, 8)}…`);
  if (d.distance > 100) bad('distance too large, expected < 100 m');
  helper.once('rtc', async (msg) => {
    if (!msg.data || !msg.data.sdp) return bad('offer missing');
    ok('helper received SDP offer');
    helper.emit('rtc', { pairId: d.pairId, data: { sdp: { type: 'answer', sdp: 'v=0 fake-answer' } } });
    ok('helper sent fake answer');
  });
});

helper.on('pair-over', () => {
  ok('helper got pair-over');
  ended.helper = true;
  maybeFinish();
});

sos.on('connect', () => {
  ok('sos connected');
  sos.emit('hello', { role: 'sos' });
  setTimeout(() => {
    sos.emit('nearby-count', { lat: LAT, lng: LNG });
    sos.emit('sos', { lat: LAT + 0.0001, lng: LNG + 0.0001 });
    ok('sos emitted SOS request');
  }, 400);
});

sos.on('nearby-count', ({ count }) => {
  if (count < 1) bad('nearby-count should be >= 1, got ' + count);
  else ok(`nearby-count = ${count}`);
});

sos.on('matched', (d) => {
  if (d.role !== 'sos') return bad('sos matched with wrong role');
  ok(`sos matched, distance=${d.distance} m, helperLabel=${d.otherLabel}`);
  if (!/^Sathi #\d{4}$/.test(d.otherLabel)) bad('helper label should be anonymous Sathi #XXXX');
  if (d.distance > 100) bad('distance too large, expected < 100 m');
  sos.emit('rtc', { pairId: d.pairId, data: { sdp: { type: 'offer', sdp: 'v=0 fake-offer' } } });
  ok('sos sent fake offer');
});

sos.on('rtc', (msg) => {
  ok('sos received SDP answer relay');
  sos.emit('end-call', { pairId: msg.pairId });
  ok('sos ended call');
});

sos.on('pair-over', () => {
  ok('sos got pair-over');
  ended.sos = true;
  maybeFinish();
});

far.on('connect', () => {
  far.emit('sos', { lat: 30.0, lng: 78.0 });
  ok('far-away SOS emitted (no helpers in range)');
});
far.on('search-ring', ({ ring }) => ok(`far SOS search ring ${ring} m`));
far.on('no-helpers', () => {
  ok('far SOS got no-helpers');
  if (ended.helper && ended.sos) { clearTimeout(guard); setTimeout(finished, 300); }
  else setTimeout(() => { bad('pair test incomplete when far test finished'); finished(); }, 4000);
});
