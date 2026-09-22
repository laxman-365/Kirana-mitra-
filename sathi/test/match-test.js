/**
 * Headless test of the Sathi core (no browser needed).
 *  1. helper (gu) goes ready near SOS (mr)
 *  2. both get `matched` with correct distance + each other's LANGUAGE
 *  3. SDP offer/answer relay works
 *  4. translated chat + live-speech text relay both ways
 *  5. end-call -> both get pair-over
 *  6. far-away SOS with no helpers -> `no-helpers`
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
const guard = setTimeout(() => { bad('global timeout'); finished(); }, 25000);

const helper = io(BASE, { transports: ['websocket'], forceNew: true });
const sos = io(BASE, { transports: ['websocket'], forceNew: true });
const far = io(BASE, { transports: ['websocket'], forceNew: true });

const got = {
  helperMatched: false, sosMatched: false,
  helperOffer: false, sosAnswer: false,
  helperChat: false, sosChat: false,
  helperSpeech: false,
  over: { helper: false, sos: false },
  farNoHelpers: false,
};
const stepsDone = () => Object.keys(got).every((k) =>
  k === 'over' ? got.over.helper && got.over.sos : got[k]
) && got.farNoHelpers;
const maybeFinish = () => {
  if (stepsDone()) {
    clearTimeout(guard);
    setTimeout(finished, 300);
  }
};

/* ---------------- helper ---------------- */
helper.on('connect', () => {
  ok('helper connected');
  helper.emit('hello', { role: 'helper', lang: 'gu' });
  helper.emit('ready', { on: true, lat: LAT, lng: LNG });
});
helper.on('matched', (d) => {
  if (d.role !== 'helper') return bad('helper matched with wrong role');
  ok(`helper matched, distance=${d.distance} m`);
  if (d.otherLang !== 'mr') bad(`helper should see SOS lang 'mr', got '${d.otherLang}'`);
  else ok("helper sees SOS's language: mr");
  got.helperMatched = true;
  helper.once('rtc', (msg) => {
    if (!msg.data || !msg.data.sdp) return bad('offer missing');
    ok('helper received SDP offer');
    got.helperOffer = true;
    helper.emit('rtc', { pairId: d.pairId, data: { sdp: { type: 'answer', sdp: 'v=0 fake-answer' } } });
    ok('helper sent fake answer');
    // translated chat: helper (gu) replies
    helper.emit('chat', { pairId: d.pairId, text: 'હું તમારી મદદ કરવા આવ્યો છું' });
  });
});
helper.on('chat', (msg) => {
  if (msg.text && msg.from === 'sos') {
    ok('helper received SOS chat (to translate): "' + msg.text + '"');
    got.helperChat = true;
  }
  maybeFinish();
});
helper.on('speech', (msg) => {
  if (msg.text) {
    ok('helper received live-speech text: "' + msg.text + '"');
    got.helperSpeech = true;
  }
  maybeFinish();
});
helper.on('pair-over', () => {
  ok('helper got pair-over');
  got.over.helper = true;
  maybeFinish();
});

/* ---------------- SOS ---------------- */
sos.on('connect', () => {
  ok('sos connected');
  sos.emit('hello', { role: 'sos', lang: 'mr' });
  setTimeout(() => {
    sos.emit('sos', { lat: LAT + 0.0001, lng: LNG + 0.0001 });
    ok('sos emitted SOS request (lang: mr)');
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
  if (d.otherLang !== 'gu') bad(`sos should see helper lang 'gu', got '${d.otherLang}'`);
  else ok("sos sees helper's language: gu");
  got.sosMatched = true;
  sos.emit('rtc', { pairId: d.pairId, data: { sdp: { type: 'offer', sdp: 'v=0 fake-offer' } } });
  ok('sos sent fake offer');
  // translated chat: sos (mr) writes in Marathi
  sos.emit('chat', { pairId: d.pairId, text: 'मला मदत हवी आहे' });
  ok('sos sent chat (mr)');
  // live speech subtitle text (as the browser would relay it)
  sos.emit('speech', { pairId: d.pairId, text: 'मी पणिकत आहे' });
  ok('sos sent speech text (mr)');
});
sos.on('rtc', (msg) => {
  if (got.sosAnswer) return;
  ok('sos received SDP answer relay');
  got.sosAnswer = true;
  sos.emit('end-call', { pairId: msg.pairId });
  ok('sos ended call');
});
sos.on('chat', (msg) => {
  if (msg.text && msg.from === 'helper' && !got.sosChat) {
    ok('sos received helper chat (to translate): "' + msg.text + '"');
    got.sosChat = true;
  }
  maybeFinish();
});
sos.on('pair-over', () => {
  ok('sos got pair-over');
  got.over.sos = true;
  maybeFinish();
});

/* ---------------- far away (no helpers) ---------------- */
far.on('connect', () => {
  far.emit('sos', { lat: 30.0, lng: 78.0 });
  ok('far-away SOS emitted (no helpers in range)');
});
far.on('search-ring', ({ ring }) => ok(`far SOS search ring ${ring} m`));
far.on('no-helpers', () => {
  ok('far SOS got no-helpers');
  got.farNoHelpers = true;
  maybeFinish();
});
