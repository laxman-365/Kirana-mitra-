'use strict';
/* ============================================================
   push.js — Web Push (free, standard) with auto-generated VAPID
   - Used to reach helpers whose app is backgrounded/closed
     (their phone still gets a notification: "SOS nearby").
   - VAPID keys auto-generated on first boot (ECDSA P-256),
     stored in keys/vapid.json (git-ignored).
   - No external paid service: browsers deliver web push free
     (in production, native apps would add FCM free tier).
   ============================================================ */
const fs = require('fs');
const path = require('path');

let webpush = null;
let keys = null;
let enabled = false;

function init() {
  try {
    webpush = require('web-push');
  } catch (e) {
    return false;
  }
  const keyDir = path.join(__dirname, '..', 'keys');
  const keyFile = path.join(keyDir, 'vapid.json');
  try {
    if (fs.existsSync(keyFile)) {
      keys = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
    } else {
      keys = webpush.generateVAPIDKeys();
      fs.mkdirSync(keyDir, { recursive: true });
      fs.writeFileSync(keyFile, JSON.stringify(keys, null, 2));
    }
    webpush.setVapidDetails('mailto:admin@sathi.local', keys.publicKey, keys.privateKey);
    enabled = true;
    return true;
  } catch (e) {
    return false;
  }
}

function publicKeys() {
  return enabled ? { vapidKey: keys.publicKey } : null;
}

/**
 * @param {PushSubscription|object} sub
 * @param {object} payload
 * @returns {Promise<boolean|string>} true sent, 'expired' gone, false error
 */
async function sendPush(sub, payload) {
  if (!enabled || !sub) return false;
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 30 });
    return true;
  } catch (e) {
    if (e && (e.statusCode === 410 || e.statusCode === 404)) return 'expired';
    return false;
  }
}

module.exports = { init, publicKeys, sendPush, isEnabled: () => enabled };
