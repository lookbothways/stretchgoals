// Stretch Goals — admin send script.
// Reads /subs from Realtime Database, finds entries whose schedule matches
// today's day + the chosen time slot (and biweekly parity), and sends FCM
// pushes. Cleans up dead tokens.

import { readFile } from "node:fs/promises";
import { initializeApp, cert } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getMessaging } from "firebase-admin/messaging";

// ---------- Load shared client config ---------------------------------
// firebase-config.js contains `self.STRETCH_CONFIG = { ... };`
// We eval it with a fake `self` so we get the same values the client uses.
const cfgText = await readFile(new URL("../firebase-config.js", import.meta.url), "utf8");
const fakeSelf = {};
new Function("self", cfgText)(fakeSelf);
const cfg = fakeSelf.STRETCH_CONFIG;
if (!cfg || !cfg.firebase || cfg.firebase.projectId.startsWith("REPLACE_ME")) {
  console.error("firebase-config.js is not configured yet.");
  process.exit(1);
}

// ---------- Inputs ----------------------------------------------------
const timeSlot = (process.env.TIME_SLOT || "").trim();
const title    = (process.env.TITLE   || "Stretch Goals").trim();
const body     = (process.env.MESSAGE || "Time for your physio.").trim();
const dryRun   = process.env.DRY_RUN === "true";
if (!["morn","lunch","eve"].includes(timeSlot)) {
  console.error(`Bad TIME_SLOT: ${timeSlot}`);
  process.exit(1);
}

const svcRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!svcRaw) {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT secret.");
  process.exit(1);
}
let serviceAccount;
try { serviceAccount = JSON.parse(svcRaw); }
catch (e) { console.error("FIREBASE_SERVICE_ACCOUNT is not valid JSON."); process.exit(1); }

// ---------- Init admin SDK -------------------------------------------
const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: cfg.firebase.databaseURL
});
const db  = getDatabase(app);
const msg = getMessaging(app);

// ---------- Helpers (mirror client logic) ----------------------------
const FREQ_DAYS = {
  daily:    ["mon","tue","wed","thu","fri","sat","sun"],
  weekends: ["sat","sun"],
  mw:       ["mon","wed"],
  tt:       ["tue","thu"],
  wf:       ["wed","fri"]
};
const DAY_FROM_JS = ["sun","mon","tue","wed","thu","fri","sat"];
function isoWeek(d) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  const ys = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil((((dt - ys) / 86400000) + 1) / 7);
}

// ---------- Main -----------------------------------------------------
const now = new Date();
const dayCode = DAY_FROM_JS[now.getDay()];
const wkParity = isoWeek(now) % 2;
console.log(`Now=${now.toISOString()} day=${dayCode} slot=${timeSlot} wkParity=${wkParity}`);

const snap = await db.ref("subs").once("value");
const subs = snap.val() || {};
const total = Object.keys(subs).length;

const matched = [];
const skipped = { wrongTime: 0, wrongDay: 0, wrongWeek: 0, malformed: 0 };

for (const [uid, s] of Object.entries(subs)) {
  if (!s || typeof s !== "object" || !s.token || !s.freq || !Array.isArray(s.times)) {
    skipped.malformed++; continue;
  }
  if (!s.times.includes(timeSlot))       { skipped.wrongTime++; continue; }
  const days = (s.freq === "weekly" || s.freq === "biweekly") ? [s.day] : (FREQ_DAYS[s.freq] || []);
  if (!days.includes(dayCode))           { skipped.wrongDay++; continue; }
  if (s.freq === "biweekly" && (s.biwBucket ?? 0) !== wkParity) {
    skipped.wrongWeek++; continue;
  }
  matched.push({ uid, token: s.token });
}

console.log(`Subscribers total=${total} matched=${matched.length} skipped=`, skipped);

if (matched.length === 0) {
  console.log("Nothing to send. Done.");
  process.exit(0);
}
if (dryRun) {
  console.log("Dry run; nothing sent.");
  process.exit(0);
}

// ---------- Send ------------------------------------------------------
let ok = 0, fail = 0;
const dead = [];

for (const { uid, token } of matched) {
  try {
    // Data-only payload — the service worker calls showNotification itself.
    // Avoids the FCM auto-display path, which can silently swallow web
    // notifications when icon URLs 404 (project-pages live under /repo/...).
    await msg.send({
      token,
      data: { title, body },
      webpush: {
        headers: { Urgency: "high" },
        fcmOptions: { link: "./" }
      }
    });
    ok++;
  } catch (e) {
    fail++;
    const code = e?.errorInfo?.code || e?.code || "unknown";
    console.error(`fail ${uid}: ${code}`);
    if (code === "messaging/registration-token-not-registered"
     || code === "messaging/invalid-registration-token") {
      dead.push(uid);
    }
  }
}
console.log(`Sent=${ok} fail=${fail} deadTokens=${dead.length}`);

// Tidy up dead tokens so we don't keep retrying them.
for (const uid of dead) {
  try { await db.ref(`subs/${uid}`).remove(); } catch (e) { /* ignore */ }
}
process.exit(0);
