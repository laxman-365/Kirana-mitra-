/* ============================================================
   Sathi (साथी) — client app
   SOS → random nearby helper within 500 m → anonymous in-app
   voice call (WebRTC) → mutual live location on map →
   in-call translated chat + live voice subtitles.
   No phone numbers or identities exist anywhere in this app.
   ============================================================ */
(() => {
'use strict';

const I18N = window.I18N;
const t = (k) => I18N.t(k);

/* ---------------- utils ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000, r = (x) => (x * Math.PI) / 180;
  const dLat = r(lat2 - lat1), dLon = r(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const fmtDist = (m) => (m == null ? '—' : m < 950 ? Math.round(m) + ' m' : (m / 1000).toFixed(1) + ' km');
const fmtClock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toast(msg, ms = 3000) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = msg;
  $('#toasts').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 350); }, ms);
}
function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* noop */ } }

/* ---------------- audio (WebAudio, no assets) ---------------- */
let AC = null;
const ac = () => {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* noop */ } }
  if (AC && AC.state === 'suspended') AC.resume().catch(() => {});
  return AC;
};
function tone(freq, dur, delay = 0, gain = 0.12) {
  const a = ac(); if (!a) return;
  try {
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.value = freq; g.gain.value = gain;
    o.connect(g); g.connect(a.destination);
    const t0 = a.currentTime + delay;
    o.start(t0); o.stop(t0 + dur);
  } catch (e) { /* noop */ }
}
const sndConnect = () => { tone(880, 0.12); tone(1245, 0.22, 0.14); };
const sndAlert = () => { tone(700, 0.18); tone(700, 0.18, 0.32); tone(700, 0.18, 0.64); };

/* ---------------- state ---------------- */
const S = {
  role: null,            // 'sos' | 'helper'
  lang: 'mr',
  loc: null,             // {lat,lng,ts}
  watchId: null,
  pendingLocCb: null,
  nearby: null,
  sos: { active: false, tries: 0, ring: 500 },
  pair: null,            // {id, role, otherLabel, otherLang, otherLoc, pc, stream, connectedAt, timerId, answered, offerBuf, handled, fitted}
  helper: { ready: false, countdown: null },
  speakerOn: false,
  maps: {},
};
let socket = null;

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const iconSelf = L.divIcon({ className: '', html: '<div class="mk-self"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
const iconOther = L.divIcon({ className: '', html: '<div class="mk-other"></div>', iconSize: [20, 20], iconAnchor: [10, 10] });

/* ---------------- translation (free: MyMemory + en bridge) ---------------- */
const trCache = new Map();
async function mymemory(text, from, to) {
  try {
    const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) + '&langpair=' + from + '|' + to;
    const ctrl = new AbortController();
    const to2 = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(to2);
    const j = await res.json();
    const out = j && j.responseData && j.responseData.translatedText;
    if (out && !/^(INVALID|NO QUERY|QUERY IS TOO LONG|PLEASE SELECT|PLEASE ENTER THE)/i.test(out)) return out;
    return null;
  } catch (e) { return null; }
}
async function translate(text, from, to) {
  text = String(text).trim().slice(0, 500);
  if (!text) throw new Error('empty');
  if (!from || !to || from === to) return text;
  const key = from + '|' + to + '|' + text;
  if (trCache.has(key)) return trCache.get(key);
  let out = await mymemory(text, from, to);
  if (!out) {
    // bridge via English when the direct pair is unsupported
    const a = await mymemory(text, from, 'en');
    if (a) out = await mymemory(a, 'en', to);
  }
  if (!out) throw new Error('no translation');
  trCache.set(key, out);
  return out;
}

/* ---------------- i18n application ---------------- */
function applyI18n() {
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  $$('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  $$('[data-en]').forEach((el) => { el.textContent = I18N.tEn(el.dataset.en); });
  document.documentElement.lang = S.lang;
  document.body.dataset.lang = S.lang;
  const b = $('#roleBadge');
  if (S.role === 'sos') b.textContent = t('sosActive');
  else if (S.role === 'helper') b.textContent = t('helperActive');
  if (S.pair) {
    setCallWho();
    const cs = $('#callState');
    if (cs) { cs.textContent = S.pair.connectedAt ? t('live') : t('connecting'); cs.className = 'chip ' + (S.pair.connectedAt ? 'ok' : 'warn'); }
    paintSubsHead();
  }
  updateCallDist();
  renderNearbyText();
}
function setLang(code) {
  S.lang = code;
  I18N.current = code;
  try { localStorage.setItem('sathi-lang', code); } catch (e) { /* noop */ }
  if (socket && socket.connected) socket.emit('hello', { role: S.role, lang: code });
  applyI18n();
}

/* ---------------- views ---------------- */
function show(id) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === id));
  const b = $('#roleBadge');
  if (S.role === 'sos') { b.hidden = false; b.textContent = t('sosActive'); b.classList.remove('green'); }
  else if (S.role === 'helper') { b.hidden = false; b.textContent = t('helperActive'); b.classList.add('green'); }
  else b.hidden = true;
  $('#subs').hidden = (id !== 'view-call');
  requestAnimationFrame(() => { renderActiveMaps(); });
}

/* ---------------- maps ---------------- */
function mapBase(el) {
  const id = el.id;
  if (!S.maps[id]) {
    const m = L.map(el, { zoomControl: true });
    L.tileLayer(TILES, { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
    S.maps[id] = { m, self: null, other: null, circle: null, fitted: false };
  }
  const h = S.maps[id];
  setTimeout(() => h.m.invalidateSize(), 80);
  return h;
}
function putSelf(h, lat, lng) {
  if (!h.self) h.self = L.marker([lat, lng], { icon: iconSelf, interactive: false }).addTo(h.m);
  else h.self.setLatLng([lat, lng]);
}
function putOther(h, lat, lng, fit) {
  if (!h.other) h.other = L.marker([lat, lng], { icon: iconOther, interactive: false }).addTo(h.m);
  else h.other.setLatLng([lat, lng]);
  if (fit && !h.fitted && h.self) {
    h.m.fitBounds(L.latLngBounds([h.self.getLatLng()], [lat, lng]).pad(0.4), { maxZoom: 18 });
    h.fitted = true;
  }
}
function ringCircle(h, lat, lng, radius, color) {
  if (!h.circle) h.circle = L.circle([lat, lng], { radius, color, weight: 1.5, dashArray: '6 6', fillColor: color, fillOpacity: 0.07 }).addTo(h.m);
  else { h.circle.setLatLng([lat, lng]); h.circle.setRadius(radius); }
}
function renderSearchMap() {
  if (!$('#view-sos-search').classList.contains('active')) return;
  const h = mapBase($('#mapSearch'));
  if (!S.loc) return;
  putSelf(h, S.loc.lat, S.loc.lng);
  ringCircle(h, S.loc.lat, S.loc.lng, S.sos.ring, '#ffb020');
  h.m.setView([S.loc.lat, S.loc.lng], 16);
}
function renderReadyMap() {
  if (!$('#view-helper-ready').classList.contains('active')) return;
  const h = mapBase($('#mapReady'));
  if (!S.loc) return;
  putSelf(h, S.loc.lat, S.loc.lng);
  ringCircle(h, S.loc.lat, S.loc.lng, 500, '#22c55e');
  h.m.setView([S.loc.lat, S.loc.lng], 16);
}
function renderIncomingMap() {
  if (!$('#view-incoming').classList.contains('active')) return;
  const h = mapBase($('#mapIncoming'));
  h.fitted = false;
  if (S.loc) putSelf(h, S.loc.lat, S.loc.lng);
  const o = S.pair && S.pair.otherLoc;
  if (o && S.loc) putOther(h, o.lat, o.lng, true);
  else if (o) h.m.setView([o.lat, o.lng], 16);
}
function renderCallMap() {
  if (!$('#view-call').classList.contains('active')) return;
  const h = mapBase($('#mapCall'));
  h.fitted = false;
  if (S.loc) putSelf(h, S.loc.lat, S.loc.lng);
  const o = S.pair && S.pair.otherLoc;
  if (o && S.loc) putOther(h, o.lat, o.lng, true);
  else if (o) h.m.setView([o.lat, o.lng], 16);
}
function renderActiveMaps() {
  const active = $('.view.active'); if (!active) return;
  if (active.id === 'view-sos-search') renderSearchMap();
  else if (active.id === 'view-helper-ready') renderReadyMap();
  else if (active.id === 'view-incoming') renderIncomingMap();
  else if (active.id === 'view-call') renderCallMap();
}
function pairDist() {
  if (S.pair && S.pair.otherLoc && S.loc)
    return haversineM(S.loc.lat, S.loc.lng, S.pair.otherLoc.lat, S.pair.otherLoc.lng);
  return null;
}
function updateCallDist() {
  const el = $('#callDist');
  if (!el) return;
  el.textContent = t('distance') + ': ' + fmtDist(pairDist());
}

/* ---------------- nearby count ---------------- */
function refreshNearbyCount() {
  if (socket && socket.connected && S.loc) socket.emit('nearby-count', { lat: S.loc.lat, lng: S.loc.lng });
}
function renderNearbyText() {
  const el1 = $('#nearbyCount'), el2 = $('#searchNearby');
  if (el1) el1.innerHTML = S.nearby == null ? t('nearby0') : t('nearbyN').replace('{n}', S.nearby);
  if (el2 && S.nearby != null) el2.innerHTML = '🤝 <b>' + S.nearby + '</b>';
}

/* ---------------- location ---------------- */
function startWatch() {
  if (S.watchId != null) { navigator.geolocation.clearWatch(S.watchId); S.watchId = null; }
  if (!('geolocation' in navigator)) { openLocModal(); return; }
  S.watchId = navigator.geolocation.watchPosition(
    (p) => onLoc(p.coords.latitude, p.coords.longitude),
    () => { if (!S.loc) openLocModal(); },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 }
  );
}
function stopWatch() { if (S.watchId != null) { navigator.geolocation.clearWatch(S.watchId); S.watchId = null; } }
function onLoc(lat, lng) {
  S.loc = { lat, lng, ts: Date.now() };
  if (socket && socket.connected) socket.emit('loc', { lat, lng });
  renderActiveMaps();
  updateCallDist();
  refreshNearbyCount();
  if (S.pendingLocCb) { const cb = S.pendingLocCb; S.pendingLocCb = null; cb(); }
}
function openLocModal() {
  const modal = $('#locModal');
  if (!modal.hidden) return;
  modal.hidden = false;
  const h = mapBase($('#mapManual'));
  h.m.setView(S.loc ? [S.loc.lat, S.loc.lng] : [19.076, 72.8777], S.loc ? 16 : 10);
  if (!h._wired) {
    h._wired = true;
    h.m.on('click', (e) => { onLoc(e.latlng.lat, e.latlng.lng); modal.hidden = true; });
  }
}

/* ---------------- roles ---------------- */
function enterNeedHelp() {
  S.role = 'sos';
  if (socket) socket.emit('hello', { role: 'sos', lang: S.lang });
  startWatch();
  show('view-sos-home');
  refreshPermBadges();
  renderNearbyText();
}
function enterHelpReady() {
  if (S.helper.ready) return;
  S.role = 'helper';
  if (socket) socket.emit('hello', { role: 'helper', lang: S.lang });
  startWatch();
  if (S.loc) activateHelper();
  else S.pendingLocCb = () => { if (!S.helper.ready) activateHelper(); };
}
function activateHelper() {
  if (!S.loc) return;
  S.helper.ready = true;
  socket.emit('ready', { on: true, lat: S.loc.lat, lng: S.loc.lng });
  show('view-helper-ready');
  toast(t('t_sathiReady'));
}
function stopHelper() {
  S.helper.ready = false;
  if (socket) socket.emit('ready', { on: false });
  S.role = null;
  stopWatch();
  show('view-landing');
}

/* ---------------- SOS flow ---------------- */
function fireSOS() {
  if (!S.loc) { S.pendingLocCb = fireSOS; openLocModal(); return; }
  S.sos.active = true;
  S.sos.ring = 500;
  S.sos.tries = 1;
  show('view-sos-search');
  $('#searchStatus').innerHTML = t('searching');
  $('#searchSpin').classList.add('spin');
  socket.emit('sos', { lat: S.loc.lat, lng: S.loc.lng });
  vibrate(150);
  renderSearchMap();
  refreshNearbyCount();
}
function cancelSOS() {
  S.sos.active = false;
  $('#searchSpin').classList.remove('spin');
  show('view-sos-home');
  toast(t('t_sosCancel'));
}

/* ---------------- call (WebRTC) ---------------- */
function setCallWho() {
  if (!S.pair) return;
  $('#callWho').innerHTML = S.pair.role === 'sos'
    ? t('callWhoSos').replace('{l}', escapeHtml(S.pair.otherLabel))
    : t('callWhoHelper');
}
function paintSubsHead() {
  const el = $('#subsLang');
  if (el && S.pair) el.textContent = I18N.name(S.lang) + ' ⇄ ' + I18N.name(S.pair.otherLang);
}
async function connectPC(offerer) {
  const pair = S.pair; if (!pair) return;
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
  });
  pair.pc = pc;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    pair.stream = stream;
    stream.getAudioTracks().forEach((tr) => pc.addTrack(tr, stream));
  } catch (e) {
    toast(t('t_noMic'));
  }
  pc.onicecandidate = (e) => { if (e.candidate) socket.emit('rtc', { pairId: pair.id, data: { candidate: e.candidate } }); };
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    const el = $('#callState');
    if (st === 'connected' && !pair.connectedAt) {
      pair.connectedAt = Date.now();
      el.textContent = t('live'); el.className = 'chip ok';
      pair.timerId = setInterval(() => { $('#callTimer').textContent = fmtClock((Date.now() - pair.connectedAt) / 1000); }, 1000);
    } else if (st === 'failed') { el.textContent = t('failed'); el.className = 'chip warn'; }
  };
  pc.ontrack = (e) => {
    const audio = $('#remoteAudio');
    audio.srcObject = e.streams[0] || new MediaStream([e.track]);
    audio.play().catch(() => { /* autoplay policy */ });
  };
  if (offerer) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('rtc', { pairId: pair.id, data: { sdp: pc.localDescription } });
  } else if (pair.offerBuf) {
    const b = pair.offerBuf; pair.offerBuf = null;
    applySdp(pc, pair.id, b);
  }
  startSubs();
}
async function applySdp(pc, pairId, sdp) {
  try {
    if (sdp.type === 'offer') {
      await pc.setRemoteDescription(sdp);
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      socket.emit('rtc', { pairId, data: { sdp: pc.localDescription } });
    } else {
      await pc.setRemoteDescription(sdp);
    }
  } catch (e) { console.warn('sdp error', e); }
}
function teardownCall() {
  const p = S.pair; if (!p) return;
  clearInterval(p.timerId);
  stopSubs();
  if (p.pc) { try { p.pc.close(); } catch (e) { /* noop */ } }
  if (p.stream) p.stream.getTracks().forEach((tr) => tr.stop());
  $('#remoteAudio').srcObject = null;
  $('#subs').hidden = true;
  $('#chatInput').value = '';
  S.pair = null;
}
function hangUp() {
  if (!S.pair) return;
  const role = S.pair.role, id = S.pair.id;
  S.pair.handled = true;
  socket.emit('end-call', { pairId: id });
  teardownCall();
  if (role === 'sos') showEnd();
  else {
    if (S.helper.ready) show('view-helper-ready');
    else show('view-landing');
    toast(t('t_sessionEnd'));
  }
}
function onPairOver(info) {
  if (!S.pair || S.pair.handled) return;
  const role = S.pair.role;
  teardownCall();
  if (role === 'sos') {
    const retryable = ['no-answer', 'declined', 'left'].includes(info.reason) && S.sos.tries < 3;
    if (retryable && S.loc) {
      S.sos.tries++;
      show('view-sos-search');
      $('#searchSpin').classList.add('spin');
      $('#searchStatus').innerHTML = t('t_retry');
      toast(t('t_retry'));
      setTimeout(() => {
        if (S.sos.tries < 3 && S.loc) socket.emit('sos', { lat: S.loc.lat, lng: S.loc.lng });
        else showEnd();
      }, 1500);
      return;
    }
    showEnd();
  } else {
    if (S.helper.ready) show('view-helper-ready');
    else show('view-landing');
    toast(t('t_sessionEnd'));
  }
}
function showEnd() {
  S.sos.active = false;
  S.sos.tries = 0;
  $('#searchSpin').classList.remove('spin');
  show('view-end');
}

/* ---------------- matched ---------------- */
function onMatched(d) {
  const pair = {
    id: d.pairId,
    role: d.role,
    otherLabel: d.otherLabel || 'Sathi',
    otherLang: d.otherLang || 'en',
    otherLoc: d.sos ? { lat: d.sos.lat, lng: d.sos.lng, ts: Date.now() } : null,
    pc: null, stream: null, connectedAt: null, timerId: null,
    answered: false, offerBuf: null, handled: false, fitted: false,
  };
  S.pair = pair;
  $('#chatLog').innerHTML = '';
  $('#subsList').innerHTML = '';
  paintSubsHead();
  if (d.role === 'sos') {
    S.sos.active = false;
    show('view-call');
    setCallWho();
    $('#callState').textContent = t('connecting'); $('#callState').className = 'chip warn';
    $('#callTimer').textContent = '00:00';
    $('#callDist').textContent = t('distance') + ': ~' + fmtDist(d.distance);
    sndConnect();
    connectPC(true);
  } else {
    show('view-incoming');
    $('#incDist').textContent = '~' + fmtDist(d.distance);
    $('#incCount').textContent = '5';
    sndAlert();
    vibrate([500, 250, 500, 250, 500]);
    startCountdown(5, () => answerIncoming(true));
  }
}
function startCountdown(sec, cb) {
  clearInterval(S.helper.countdown);
  let left = sec;
  S.helper.countdown = setInterval(() => {
    left--;
    if (left <= 0) { clearInterval(S.helper.countdown); cb(); return; }
    $('#incCount').textContent = left;
    tone(700, 0.12);
  }, 1000);
}
function answerIncoming(auto) {
  if (!S.pair || S.pair.role !== 'helper' || S.pair.answered) return;
  S.pair.answered = true;
  clearInterval(S.helper.countdown);
  show('view-call');
  setCallWho();
  $('#callState').textContent = t('connecting'); $('#callState').className = 'chip warn';
  $('#callTimer').textContent = '00:00';
  updateCallDist();
  sndConnect();
  connectPC(false);
  if (auto) toast(t('t_autoAccept'));
}
function declineIncoming() {
  clearInterval(S.helper.countdown);
  if (S.pair) socket.emit('decline', { pairId: S.pair.id });
  S.pair = null;
  if (S.helper.ready) show('view-helper-ready'); else show('view-landing');
  toast(t('t_cannotTake'));
}

/* ---------------- rtc / peer events ---------------- */
function onRtc(msg) {
  const pair = S.pair;
  if (!pair || pair.id !== msg.pairId) return;
  const pc = pair.pc;
  if (!pc) {
    if (msg.data && msg.data.sdp) pair.offerBuf = msg.data.sdp; // buffer until PC exists
    return;
  }
  if (msg.data && msg.data.sdp) applySdp(pc, pair.id, msg.data.sdp);
  else if (msg.data && msg.data.candidate) {
    pc.addIceCandidate(msg.data.candidate).catch(() => { /* noop */ });
  }
}
function onPeerLoc(d) {
  if (!S.pair || !d) return;
  S.pair.otherLoc = d;
  updateCallDist();
  renderActiveMaps();
}

/* ---------------- in-call translated chat ---------------- */
function sendChat() {
  const inp = $('#chatInput');
  const text = inp.value.trim();
  if (!text || !S.pair) return;
  inp.value = '';
  socket.emit('chat', { pairId: S.pair.id, text });
  addMsg('you', text);
}
function addMsg(side, text) {
  const log = $('#chatLog');
  const div = document.createElement('div');
  div.className = 'msg ' + side;
  const who = side === 'you' ? t('chatYou') : t('chatThey');
  const body = escapeHtml(text);
  if (side === 'other' && S.pair.otherLang && S.pair.otherLang !== S.lang) {
    div.innerHTML = `<span class="who">${who} · ${escapeHtml(I18N.name(S.pair.otherLang))}</span><span class="tr">${escapeHtml(t('trTry'))}…</span><span class="orig">${body}</span>`;
    translate(text, S.pair.otherLang, S.lang)
      .then((tr) => { div.querySelector('.tr').textContent = tr; })
      .catch(() => { const el2 = div.querySelector('.tr'); el2.classList.add('trbad'); el2.textContent = t('subFailed'); });
  } else if (side === 'you') {
    div.innerHTML = `<span class="who">${who}</span><span class="tr">${body}</span>`;
    if (S.pair && S.pair.otherLang && S.pair.otherLang !== S.lang) {
      translate(text, S.lang, S.pair.otherLang).then((tr) => {
        const o = document.createElement('span');
        o.className = 'orig';
        o.textContent = '→ ' + tr;
        div.appendChild(o);
      }).catch(() => { /* noop */ });
    }
  } else {
    div.innerHTML = `<span class="who">${who}</span><span class="tr">${body}</span>`;
  }
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

/* ---------------- live voice subtitles ---------------- */
let rec = null;
function startSubs() {
  stopSubs();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const st = $('#trStatus');
  if (!SR) {
    st.textContent = t('trBrowser');
    return;
  }
  try {
    rec = new SR();
    rec.lang = I18N.speechLang(S.lang);
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    st.textContent = t('trTry');
    rec.onresult = (e) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += (text ? ' ' : '') + e.results[i][0].transcript;
      }
      text = text.trim();
      if (!text || !S.pair || !S.pair.id) return;
      socket.emit('speech', { pairId: S.pair.id, text });
      addSub('you', text);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed') st.textContent = t('trOff') + ' · mic';
    };
    rec.onend = () => {
      if (S.pair && S.pair.pc) { try { rec.start(); } catch (e2) { /* already running */ } }
    };
    rec.start();
    st.textContent = t('trOn');
  } catch (e) {
    st.textContent = t('trBrowser');
  }
}
function stopSubs() {
  if (rec) {
    const r = rec; rec = null;
    r.onend = null; r.onerror = null; r.onresult = null;
    try { r.stop(); } catch (e) { /* noop */ }
  }
}
function addSub(side, text) {
  const list = $('#subsList');
  const div = document.createElement('div');
  div.className = 'sub-line ' + (side === 'you' ? 'you' : 'other');
  const who = side === 'you' ? t('subYou') : t('subThey');
  const target = side === 'you' ? (S.pair ? S.pair.otherLang : 'en') : S.lang;
  div.innerHTML = `<span class="who">${who} · ${escapeHtml(I18N.name(target))}</span><span class="txt"></span>`;
  list.appendChild(div);
  while (list.children.length > 5) list.removeChild(list.firstChild);
  const txtEl = div.querySelector('.txt');
  if (target !== S.lang) {
    txtEl.textContent = text + ' — ' + t('trTry');
    translate(text, S.lang === 'en' ? 'en' : (side === 'you' ? S.lang : (S.pair ? S.pair.otherLang : 'en')), target)
      .then((tr) => { txtEl.textContent = tr; })
      .catch(() => { txtEl.textContent = text + ' ' + t('subFailed'); });
  } else {
    txtEl.textContent = text;
  }
  list.scrollTop = list.scrollHeight;
}

/* ---------------- permissions badges ---------------- */
function refreshPermBadges() {
  const box = $('#permBadges'); if (!box) return;
  box.innerHTML = '';
  [['geolocation', '📍 Location'], ['microphone', '🎙 Mic']].forEach(([n, label]) => {
    const el = document.createElement('span');
    el.className = 'chip';
    el.textContent = label + ' …';
    box.appendChild(el);
    const mark = (st) => {
      el.textContent = label + ' ' + (st === 'granted' ? '✓' : st === 'denied' ? '✗' : '?');
      if (st === 'granted') el.classList.add('ok');
      if (st === 'denied') el.classList.add('warn');
    };
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: n }).then((s) => {
        mark(s.state);
        s.onchange = () => mark(s.state);
      }).catch(() => { el.textContent = label; });
    } else el.textContent = label;
  });
}

/* ---------------- share / speaker / mute ---------------- */
async function shareLoc() {
  if (!S.loc) return;
  const { lat, lng } = S.loc;
  const url = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
  const text = '📍 ' + I18N.name(S.lang) + ' · Sathi live location';
  if (navigator.share) {
    try { await navigator.share({ title: 'Sathi', text, url }); return; } catch (e) { /* cancelled */ }
  }
  try { await navigator.clipboard.writeText(url); toast(t('t_copied')); }
  catch (e) { toast(url); }
}
async function toggleSpeaker() {
  try {
    const a = $('#remoteAudio');
    if (!a.setSinkId || !navigator.mediaDevices || !navigator.mediaDevices.getOutputDevices) {
      toast(t('t_spkNo'));
      return;
    }
    const devs = await navigator.mediaDevices.getOutputDevices();
    const spk = devs.find((d) => d.kind === 'audiooutput' && /speaker/i.test(d.label)) || devs[devs.length - 1];
    if (S.speakerOn) await a.setSinkId(devs[0] ? devs[0].deviceId : 'default');
    else await a.setSinkId(spk ? spk.deviceId : 'default');
    S.speakerOn = !S.speakerOn;
    $('#btnSpeaker').classList.toggle('on', S.speakerOn);
    toast(S.speakerOn ? t('t_spkOn') : t('t_spkOff'));
  } catch (e) { toast(t('t_spkNo')); }
}
function toggleMute() {
  const tr = S.pair && S.pair.stream && S.pair.stream.getAudioTracks()[0];
  if (!tr) return;
  tr.enabled = !tr.enabled;
  $('#btnMute').classList.toggle('on', !tr.enabled);
  toast(tr.enabled ? t('t_muteOn') : t('t_muteOff'));
}

/* ---------------- SOS hold button ---------------- */
function wireSOSButton() {
  const btn = $('#sosBtn');
  const HOLD_MS = 1800;
  let raf = 0, start = 0;
  const stop = () => { cancelAnimationFrame(raf); btn.style.setProperty('--p', 0); };
  const loop = () => {
    const el = Date.now() - start;
    btn.style.setProperty('--p', Math.min(el / HOLD_MS, 1));
    if (el >= HOLD_MS) { stop(); fireSOS(); }
    else raf = requestAnimationFrame(loop);
  };
  btn.addEventListener('pointerdown', (e) => {
    try { btn.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    start = Date.now();
    raf = requestAnimationFrame(loop);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => btn.addEventListener(ev, stop));
}

/* ---------------- init ---------------- */
function init() {
  /* language picker */
  const sel = $('#langSel');
  I18N.LANGS.forEach((l) => {
    const o = document.createElement('option');
    o.value = l.code;
    o.textContent = l.name;
    sel.appendChild(o);
  });
  let saved = 'mr';
  try { saved = localStorage.getItem('sathi-lang') || 'mr'; } catch (e) { /* noop */ }
  if (!I18N.LANGS.some((l) => l.code === saved)) saved = 'mr';
  S.lang = saved;
  I18N.current = saved;
  sel.value = saved;
  sel.addEventListener('change', () => setLang(sel.value));

  socket = io();

  socket.on('connect', () => {
    socket.emit('hello', { role: S.role, lang: S.lang });
    if (S.role === 'helper' && S.helper.ready && S.loc) socket.emit('ready', { on: true, lat: S.loc.lat, lng: S.loc.lng });
    refreshPermBadges();
  });
  socket.on('disconnect', () => toast('⚠️ ' + (S.lang === 'en' ? 'Server connection lost — reconnecting…' : 'Server connection तुटली — पुन्हा जोडत आहोत…')));
  socket.on('nearby-count', ({ count }) => { S.nearby = count; renderNearbyText(); });
  socket.on('search-ring', ({ ring }) => {
    S.sos.ring = ring;
    renderSearchMap();
    $('#searchStatus').innerHTML = t('expanding').replace('{r}', fmtDist(ring));
  });
  socket.on('no-helpers', () => {
    $('#searchSpin').classList.remove('spin');
    $('#searchStatus').innerHTML = t('noHelpers');
    toast(t('t_noSathi'));
  });
  socket.on('matched', onMatched);
  socket.on('rtc', onRtc);
  socket.on('peer-loc', onPeerLoc);
  socket.on('pair-over', onPairOver);
  socket.on('chat', (msg) => { if (S.pair && msg.pairId === S.pair.id) addMsg('other', msg.text); });
  socket.on('speech', (msg) => { if (S.pair && msg.pairId === S.pair.id) addSub('other', msg.text); });

  /* buttons */
  $('#btnNeedHelp').addEventListener('click', enterNeedHelp);
  $('#btnHelpReady').addEventListener('click', enterHelpReady);
  $('#btnBackLanding').addEventListener('click', () => { S.role = null; stopWatch(); show('view-landing'); });
  $('#btnCancelSOS').addEventListener('click', cancelSOS);
  $('#btnStopHelper').addEventListener('click', stopHelper);
  $('#btnAnswer').addEventListener('click', () => answerIncoming(false));
  $('#btnDecline').addEventListener('click', declineIncoming);
  $('#btnEnd').addEventListener('click', hangUp);
  $('#btnMute').addEventListener('click', toggleMute);
  $('#btnSpeaker').addEventListener('click', toggleSpeaker);
  $('#btnShare').addEventListener('click', shareLoc);
  $('#btnSafe').addEventListener('click', () => { S.role = null; stopWatch(); show('view-landing'); });
  $('#btnDemo').addEventListener('click', () => {
    try {
      window.open(location.origin + location.pathname + '?role=helper', '_blank');
    } catch (e) {
      toast('Popup block झाला — नवीन tab मध्ये उघडा: ' + location.origin + location.pathname + '?role=helper');
    }
    enterNeedHelp();
    toast('दुसऱ्या tab मध्ये location permission द्या → मग इथे SOS दबा');
  });
  $('#btnMoreHelp').addEventListener('click', () => show('view-sos-home'));
  $('#btnCloseLocModal').addEventListener('click', () => { $('#locModal').hidden = true; });
  $('#chatSend').addEventListener('click', sendChat);
  $('#chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

  wireSOSButton();

  /* keep-alive location every 2.5 s while active */
  setInterval(() => {
    if (socket && socket.connected && S.loc && (S.helper.ready || S.pair || S.sos.active)) {
      socket.emit('loc', { lat: S.loc.lat, lng: S.loc.lng });
    }
  }, 2500);
  /* refresh nearby count every 10 s on SOS home */
  setInterval(() => {
    if (S.role === 'sos' && !S.pair && !S.sos.active) refreshNearbyCount();
  }, 10000);

  applyI18n();
  show('view-landing');

  /* auto role from URL — used by the 1-click demo (helper tab) */
  try {
    const p = new URLSearchParams(location.search).get('role');
    if (p === 'helper') setTimeout(() => { enterHelpReady(); toast('🟢 ही tab = साथी (मदत करणारा) मोड'); }, 700);
    else if (p === 'sos') setTimeout(() => { enterNeedHelp(); toast('🆘 ही tab = SOS मोड'); }, 700);
  } catch (e) { /* noop */ }
}
document.addEventListener('DOMContentLoaded', init);
})();
