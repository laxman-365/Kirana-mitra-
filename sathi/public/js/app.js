/* ============================================================
   Sathi (साथी) — client app
   SOS → random nearby helper within 500 m → anonymous in-app
   voice call (WebRTC) → mutual live location on map.
   No phone numbers or identities exist anywhere in this app.
   ============================================================ */
(() => {
'use strict';

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

function toast(msg, ms = 3000) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = msg;
  $('#toasts').appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, ms);
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
  loc: null,             // {lat,lng,ts}
  watchId: null,
  pendingLocCb: null,    // action to run once location is known
  sos: { active: false, tries: 0, ring: 500 },
  pair: null,            // {id, role, otherLabel, otherLoc, pc, stream, connectedAt, timerId, answered, offerBuf, handled, fitted}
  helper: { ready: false, countdown: null },
  speakerOn: false,
  maps: {},              // containerId -> {m, self, other, circle, fitted}
};
let socket = null;

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const iconSelf = L.divIcon({ className: '', html: '<div class="mk-self"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
const iconOther = L.divIcon({ className: '', html: '<div class="mk-other"></div>', iconSize: [20, 20], iconAnchor: [10, 10] });

/* ---------------- views ---------------- */
function show(id) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === id));
  const b = $('#roleBadge');
  if (S.role === 'sos') { b.hidden = false; b.textContent = 'SOS mode'; b.classList.remove('green'); }
  else if (S.role === 'helper') { b.hidden = false; b.textContent = 'सथी mode'; b.classList.add('green'); }
  else b.hidden = true;
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
  const d = pairDist();
  $('#callDist').textContent = 'अंतर: ' + fmtDist(d);
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
  $('#nearbyCount') && $('#nearbyCount'); // (no-op) keep refs warm
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

/* ---------------- nearby count ---------------- */
function refreshNearbyCount() {
  if (socket && socket.connected && S.loc) socket.emit('nearby-count', { lat: S.loc.lat, lng: S.loc.lng });
}
function setNearbyText(n) {
  const el1 = $('#nearbyCount'), el2 = $('#searchNearby');
  const txt = n ? `जवळपास <b>${n}</b> सथी तयार 🤝` : 'सध्या जवळपास सथी नाहीत';
  if (el1) el1.innerHTML = txt;
  if (el2) el2.innerHTML = 'जवळचे सथी: <b>' + (n || 0) + '</b>';
}

/* ---------------- roles ---------------- */
function enterNeedHelp() {
  S.role = 'sos';
  if (socket) socket.emit('hello', { role: 'sos' });
  startWatch();
  show('view-sos-home');
  refreshPermBadges();
}
function enterHelpReady() {
  if (S.helper.ready) return;
  S.role = 'helper';
  if (socket) socket.emit('hello', { role: 'helper' });
  startWatch();
  if (S.loc) activateHelper();
  else S.pendingLocCb = () => { if (!S.helper.ready) activateHelper(); };
}
function activateHelper() {
  if (!S.loc) return;
  S.helper.ready = true;
  socket.emit('ready', { on: true, lat: S.loc.lat, lng: S.loc.lng });
  show('view-helper-ready');
  toast('🟢 तुम्ही सथी — जवळचा SOS तुम्हाला येईल');
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
  $('#searchStatus').innerHTML = 'जवळपास <b>500 m</b> मधून सथी शोधत आहोत… <span class="en">Searching for a sathi within 500 m…</span>';
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
  toast('SOS रद्द झाला');
}

/* ---------------- call (WebRTC) ---------------- */
async function connectPC(offerer) {
  const pair = S.pair; if (!pair) return;
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
  });
  pair.pc = pc;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    pair.stream = stream;
    stream.getAudioTracks().forEach((t) => pc.addTrack(t, stream));
  } catch (e) {
    toast('🎙 Mic permission नाही — कॉल silent असेल');
  }
  pc.onicecandidate = (e) => { if (e.candidate) socket.emit('rtc', { pairId: pair.id, data: { candidate: e.candidate } }); };
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    const el = $('#callState');
    if (st === 'connected' && !pair.connectedAt) {
      pair.connectedAt = Date.now();
      el.textContent = 'कॉल live ✓'; el.className = 'chip ok';
      pair.timerId = setInterval(() => { $('#callTimer').textContent = fmtClock((Date.now() - pair.connectedAt) / 1000); }, 1000);
    } else if (st === 'failed') { el.textContent = 'Connection problem'; el.className = 'chip warn'; }
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
  if (p.pc) { try { p.pc.close(); } catch (e) { /* noop */ } }
  if (p.stream) p.stream.getTracks().forEach((t) => t.stop());
  $('#remoteAudio').srcObject = null;
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
    if (S.helper.ready) { show('view-helper-ready'); }
    else show('view-landing');
    toast('Session समाप्त — तुम्ही पुन्हा तयार आहात');
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
      $('#searchStatus').innerHTML = 'पिळता येत नव्हता — <b>पुन्हा शोधत आहोत…</b> <span class="en">Retrying…</span>';
      toast('सथी कॉल घेऊ शकला नाही — पुन्हा प्रयत्न…');
      setTimeout(() => {
        if (S.sos.tries < 3 && S.loc) { socket.emit('sos', { lat: S.loc.lat, lng: S.loc.lng }); }
        else showEnd();
      }, 1500);
      return;
    }
    showEnd();
  } else {
    if (S.helper.ready) show('view-helper-ready');
    else show('view-landing');
    toast('Session समाप्त — तुम्ही पुन्हा तयार आहात');
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
  if (d.role === 'sos') {
    S.sos.active = false;
    S.pair = {
      id: d.pairId, role: 'sos', otherLabel: d.otherLabel,
      otherLoc: null, pc: null, stream: null, connectedAt: null,
      timerId: null, answered: false, offerBuf: null, handled: false, fitted: false,
    };
    show('view-call');
    $('#callWho').innerHTML = `🆘 <b>${d.otherLabel}</b> तुम्हाला मदत करायला येतोय <span class="en">Your sathi is on the way (~${fmtDist(d.distance)})</span>`;
    $('#callState').textContent = 'कॉल जोडत आहोत…'; $('#callState').className = 'chip warn';
    $('#callTimer').textContent = '00:00';
    $('#callDist').textContent = 'अंतर: ~' + fmtDist(d.distance);
    sndConnect();
    connectPC(true);
  } else {
    S.pair = {
      id: d.pairId, role: 'helper', otherLabel: 'SOS',
      otherLoc: d.sos ? { lat: d.sos.lat, lng: d.sos.lng, ts: Date.now() } : null,
      pc: null, stream: null, connectedAt: null,
      timerId: null, answered: false, offerBuf: null, handled: false, fitted: false,
    };
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
  $('#callWho').innerHTML = `🆘 <b>SOS</b> — जवळपास मदतीसाठी <span class="en">Anonymous SOS nearby</span>`;
  $('#callState').textContent = 'कॉल जोडत आहोत…'; $('#callState').className = 'chip warn';
  $('#callTimer').textContent = '00:00';
  updateCallDist();
  sndConnect();
  connectPC(false);
  if (auto) toast('कॉल auto-accept झाला');
}
function declineIncoming() {
  clearInterval(S.helper.countdown);
  if (S.pair) socket.emit('decline', { pairId: S.pair.id });
  S.pair = null;
  if (S.helper.ready) show('view-helper-ready'); else show('view-landing');
  toast('लावले नाही — दुसरा सथी शोधला जातोय');
}

/* ---------------- rtc events ---------------- */
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
  const text = 'मी इथे आहे — माझे live location (Sathi App)';
  if (navigator.share) {
    try { await navigator.share({ title: 'Sathi', text, url }); return; } catch (e) { /* cancelled */ }
  }
  try { await navigator.clipboard.writeText(url); toast('📍 Location link copy झाला — पॉलिस/परीकडे पाठवा'); }
  catch (e) { toast(url); }
}
async function toggleSpeaker() {
  try {
    const a = $('#remoteAudio');
    if (!a.setSinkId || !navigator.mediaDevices || !navigator.mediaDevices.getOutputDevices) {
      toast('या browser मध्ये speaker बदलता येत नाही');
      return;
    }
    const devs = await navigator.mediaDevices.getOutputDevices();
    const spk = devs.find((d) => d.kind === 'audiooutput' && /speaker/i.test(d.label)) || devs[devs.length - 1];
    if (S.speakerOn) await a.setSinkId(devs[0] ? devs[0].deviceId : 'default');
    else await a.setSinkId(spk ? spk.deviceId : 'default');
    S.speakerOn = !S.speakerOn;
    $('#btnSpeaker').classList.toggle('on', S.speakerOn);
    toast(S.speakerOn ? '🔊 Speaker on' : '🔉 Receiver');
  } catch (e) { toast('Speaker बदलता आला नाही'); }
}
function toggleMute() {
  const t = S.pair && S.pair.stream && S.pair.stream.getAudioTracks()[0];
  if (!t) return;
  t.enabled = !t.enabled;
  $('#btnMute').classList.toggle('on', !t.enabled);
  toast(t.enabled ? '🎙 Mic on' : '🔇 Mic muted');
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
  socket = io();

  socket.on('connect', () => {
    if (S.role) socket.emit('hello', { role: S.role });
    if (S.role === 'helper' && S.helper.ready && S.loc) socket.emit('ready', { on: true, lat: S.loc.lat, lng: S.loc.lng });
    refreshPermBadges();
  });
  socket.on('disconnect', () => toast('⚠️ Server connection तुटली — पुन्हा जोडत आहोत…'));
  socket.on('nearby-count', ({ count }) => setNearbyText(count));
  socket.on('search-ring', ({ ring }) => {
    S.sos.ring = ring;
    renderSearchMap();
    $('#searchStatus').innerHTML = `500 m मध्ये नव्हते — आता <b>${fmtDist(ring)}</b> पर्यंत शोधत आहोत… <span class="en">Expanding search…</span>`;
  });
  socket.on('no-helpers', () => {
    $('#searchSpin').classList.remove('spin');
    $('#searchStatus').innerHTML = 'जवळपास सध्या सथी उपलब्ध नाहीत. कृपया थेट <b>112</b> ला कॉल करा. <span class="en">No sathi nearby right now.</span>';
    toast('जवळचे सथी उपलब्ध नाहीत — 112 वापरा');
  });
  socket.on('matched', onMatched);
  socket.on('rtc', onRtc);
  socket.on('peer-loc', onPeerLoc);
  socket.on('pair-over', onPairOver);

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
  $('#btnMoreHelp').addEventListener('click', () => show('view-sos-home'));
  $('#btnCloseLocModal').addEventListener('click', () => { $('#locModal').hidden = true; });

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

  show('view-landing');
}
document.addEventListener('DOMContentLoaded', init);
})();
