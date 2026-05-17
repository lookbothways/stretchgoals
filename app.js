// Stretch Goals — main client logic.
// Privacy model: anonymous Firebase auth gives each device a UID. We store
// only an FCM token + schedule pattern under /subs/{uid}. No identity.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getDatabase, ref, set, update, remove, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { getMessaging, getToken, deleteToken, onMessage, isSupported as messagingSupported }
  from "https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging.js";

// ----- Config -----
const CONFIG = self.STRETCH_CONFIG;
if (!CONFIG || !CONFIG.firebase || !CONFIG.firebase.projectId || CONFIG.firebase.projectId.startsWith("REPLACE_ME")) {
  console.warn("[Stretch Goals] firebase-config.js not configured yet. The page still works offline; reminders are disabled until you fill it in.");
}

// Wrap Firebase init in try/catch so a bad config (e.g. swapped values)
// can't take down the rest of the UI — dropdowns, streak, done button,
// etc. must keep working even when reminders are misconfigured.
let firebaseApp = null, auth = null, db = null;
try {
  if (CONFIG && CONFIG.firebase && !CONFIG.firebase.projectId.startsWith("REPLACE_ME")) {
    firebaseApp = initializeApp(CONFIG.firebase);
    auth = getAuth(firebaseApp);
    db   = getDatabase(firebaseApp);
  }
} catch (e) {
  console.error("[Stretch Goals] Firebase init failed — reminders are disabled. Check firebase-config.js. Error:", e);
  firebaseApp = null; auth = null; db = null;
}
let messaging = null;

// ----- Local storage keys -----
const LS_SCHED   = 'sg.schedule';
const LS_TOTAL   = 'sg.total';
const LS_LASTDONE= 'sg.lastdone';   // YYYY-MM-DD
const LS_STREAK  = 'sg.streak';
const LS_PUSH_ON = 'sg.pushon';     // '1' once the user has opted in; cleared when they toggle off.

const DEFAULT_SCHED = {
  freq: 'daily',
  day: 'mon',
  times: ['morn'],
  biwBucket: null
};

const TIMES_HOUR = { morn: 9, lunch: 12, eve: 18 };
const TIME_LABEL_SHORT = { morn: 'morning', lunch: 'lunchtime', eve: 'evening' };
const TIME_LABEL_LONG  = { morn: 'morning (9am)', lunch: 'lunchtime (12pm)', eve: 'evening (6pm)' };
const FREQ_LABEL = {
  daily:    'daily',
  weekends: 'just weekends',
  mw:       'on Mon & Wed',
  tt:       'on Tue & Thu',
  wf:       'on Wed & Fri',
  weekly:   'once a week',
  biweekly: 'every other week'
};
const FREQ_DAYS = {
  daily:    ['mon','tue','wed','thu','fri','sat','sun'],
  weekends: ['sat','sun'],
  mw:       ['mon','wed'],
  tt:       ['tue','thu'],
  wf:       ['wed','fri']
};
const DAY_CODE_FROM_JS = ['sun','mon','tue','wed','thu','fri','sat']; // d.getDay() index

// =====================================================================
//  Schedule helpers
// =====================================================================
function getSchedule() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_SCHED));
    return Object.assign({}, DEFAULT_SCHED, s || {});
  } catch { return { ...DEFAULT_SCHED }; }
}
function saveSchedule(s) {
  localStorage.setItem(LS_SCHED, JSON.stringify(s));
}

function isoWeek(d) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil((((dt - yearStart) / 86400000) + 1) / 7);
}

function activeDaysFor(s) {
  if (s.freq === 'weekly' || s.freq === 'biweekly') return [s.day];
  return FREQ_DAYS[s.freq] || [];
}

function dayMatches(s, date) {
  const code = DAY_CODE_FROM_JS[date.getDay()];
  if (!activeDaysFor(s).includes(code)) return false;
  if (s.freq === 'biweekly') {
    return (isoWeek(date) % 2) === (s.biwBucket ?? 0);
  }
  return true;
}

function nextReminder(s, now = new Date()) {
  if (!s.times || s.times.length === 0) return null;
  for (let i = 0; i < 21; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    if (!dayMatches(s, d)) continue;
    // try each time slot in chronological order
    const hours = s.times.map(t => TIMES_HOUR[t]).sort((a,b) => a - b);
    for (const h of hours) {
      const candidate = new Date(d);
      candidate.setHours(h, 0, 0, 0);
      if (candidate > now) return candidate;
    }
  }
  return null;
}

function formatDateNice(d) {
  if (!d) return '—';
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
  const day0 = new Date(d); day0.setHours(0,0,0,0);
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const slot = Object.entries(TIMES_HOUR).find(([,h]) => h === d.getHours())?.[0];
  const slotLabel = slot ? TIME_LABEL_SHORT[slot] : `${d.getHours()}:00`;
  if (day0.getTime() === today.getTime())   return `today, ${slotLabel}`;
  if (day0.getTime() === tomorrow.getTime()) return `tomorrow, ${slotLabel}`;
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}, ${slotLabel}`;
}

// =====================================================================
//  UI: sentence rendering
// =====================================================================
function renderSentence() {
  const s = getSchedule();
  // freq label may include a day for weekly/biweekly
  let freq = FREQ_LABEL[s.freq] || 'daily';
  if (s.freq === 'weekly')   freq = `weekly on ${dayLong(s.day)}`;
  if (s.freq === 'biweekly') freq = `every other ${dayLong(s.day)}`;
  document.getElementById('freq-label').textContent = freq;

  const times = (s.times || []).slice().sort(byTimeOrder).map(t => TIME_LABEL_SHORT[t]);
  document.getElementById('time-label').textContent =
    times.length === 0 ? 'no time set' :
    times.length === 1 ? times[0] :
    times.length === 2 ? `${times[0]} and ${times[1]}` :
    `${times[0]}, ${times[1]} and ${times[2]}`;

  const next = nextReminder(s);
  document.getElementById('next-reminder-text').textContent = next ? formatDateNice(next) : '—';
}
function byTimeOrder(a,b) { return TIMES_HOUR[a] - TIMES_HOUR[b]; }
function dayLong(code) {
  return { mon:'Monday',tue:'Tuesday',wed:'Wednesday',thu:'Thursday',
           fri:'Friday',sat:'Saturday',sun:'Sunday' }[code] || 'Monday';
}

// =====================================================================
//  Counter & streak
// =====================================================================
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate()-1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function renderStreak() {
  document.getElementById('total-num').textContent = +(localStorage.getItem(LS_TOTAL) || 0);
  document.getElementById('streak-num').textContent = +(localStorage.getItem(LS_STREAK) || 0);
}
function logDone() {
  const today = todayKey();
  const last = localStorage.getItem(LS_LASTDONE);
  let streak = +(localStorage.getItem(LS_STREAK) || 0);
  if (last !== today) {
    if (last === yesterdayKey()) streak += 1;
    else streak = 1;
    localStorage.setItem(LS_LASTDONE, today);
    localStorage.setItem(LS_STREAK, String(streak));
  }
  const total = +(localStorage.getItem(LS_TOTAL) || 0) + 1;
  localStorage.setItem(LS_TOTAL, String(total));
  renderStreak();
}

// =====================================================================
//  Dialog helpers
// =====================================================================
function openSheet(id) {
  const el = document.getElementById(id);
  if (el && typeof el.showModal === 'function') el.showModal();
  else el?.setAttribute('open', '');
}
function closeSheet(id) {
  const el = document.getElementById(id);
  if (el && typeof el.close === 'function') el.close();
  else el?.removeAttribute('open');
}

function toast(msg, ms = 2200) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

// =====================================================================
//  Frequency sheet
// =====================================================================
function openFreqSheet() {
  const s = getSchedule();
  document.querySelectorAll('input[name="freq"]').forEach(r => r.checked = r.value === s.freq);
  document.querySelectorAll('input[name="day"]').forEach(r => r.checked = r.value === s.day);
  toggleDayPicker(s.freq);
  openSheet('freq-sheet');
}
function toggleDayPicker(freq) {
  const dp = document.getElementById('day-picker');
  dp.hidden = !(freq === 'weekly' || freq === 'biweekly');
}
function bindFreqSheet() {
  document.querySelectorAll('input[name="freq"]').forEach(r =>
    r.addEventListener('change', () => toggleDayPicker(r.value)));
  document.getElementById('freq-save').addEventListener('click', () => {
    const freq = document.querySelector('input[name="freq"]:checked')?.value;
    const day  = document.querySelector('input[name="day"]:checked')?.value;
    if (!freq) return;
    if ((freq === 'weekly' || freq === 'biweekly') && !day) {
      toast('Pick a day'); return;
    }
    const s = getSchedule();
    s.freq = freq;
    if (day) s.day = day;
    if (freq === 'biweekly') {
      // Anchor to the next occurrence of the chosen day from today.
      const dayMap = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 };
      const today = new Date();
      const target = dayMap[s.day] ?? 1;
      const offset = (target - today.getDay() + 7) % 7;
      const next = new Date(today);
      next.setDate(today.getDate() + offset);
      s.biwBucket = isoWeek(next) % 2;
    } else {
      s.biwBucket = null;
    }
    saveSchedule(s);
    renderSentence();
    syncSubscription();
    closeSheet('freq-sheet');
  });
}

// =====================================================================
//  Time sheet
// =====================================================================
function openTimeSheet() {
  const s = getSchedule();
  document.querySelectorAll('input[name="time"]').forEach(c =>
    c.checked = (s.times || []).includes(c.value));
  openSheet('time-sheet');
}
function bindTimeSheet() {
  document.getElementById('time-save').addEventListener('click', () => {
    const times = Array.from(document.querySelectorAll('input[name="time"]:checked')).map(c => c.value);
    if (times.length === 0) { toast('Tick at least one time'); return; }
    const s = getSchedule();
    s.times = times;
    saveSchedule(s);
    renderSentence();
    syncSubscription();
    closeSheet('time-sheet');
  });
}

// =====================================================================
//  Menu
// =====================================================================
function bindMenu() {
  document.getElementById('menu-btn').addEventListener('click', () => openSheet('menu-sheet'));
  document.querySelectorAll('[data-close]').forEach(b =>
    b.addEventListener('click', () => closeSheet(b.dataset.close)));
  document.getElementById('qr-link').addEventListener('click', () => {
    closeSheet('menu-sheet'); openSheet('qr-sheet');
  });
  const admin = document.getElementById('admin-link');
  admin.href = (CONFIG && CONFIG.adminUrl) || '#';
  document.getElementById('reset-link').addEventListener('click', resetAll);
}

async function resetAll() {
  if (!confirm('Forget your reminder settings and turn off reminders on this device?')) return;
  localStorage.removeItem(LS_SCHED);
  localStorage.removeItem(LS_TOTAL);
  localStorage.removeItem(LS_LASTDONE);
  localStorage.removeItem(LS_STREAK);
  localStorage.removeItem(LS_PUSH_ON);
  try {
    if (auth?.currentUser && db) {
      await remove(ref(db, `subs/${auth.currentUser.uid}`));
    }
    if (messaging) {
      try { await deleteToken(messaging); } catch {}
    }
  } catch (e) { console.warn(e); }
  closeSheet('menu-sheet');
  toast('All settings forgotten');
  setTimeout(() => location.reload(), 800);
}

// =====================================================================
//  Done button
// =====================================================================
function bindDoneBtn() {
  document.getElementById('done-btn').addEventListener('click', e => {
    logDone();
    const btn = e.currentTarget;
    btn.classList.remove('celebrate');
    void btn.offsetWidth; // restart animation
    btn.classList.add('celebrate');
    toast('Nice. Logged.');
  });
}

// =====================================================================
//  Push setup
// =====================================================================
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
}
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

function bindEnable() {
  document.getElementById('enable-btn').addEventListener('click', onEnableClick);
}

async function onEnableClick() {
  const btn = document.getElementById('enable-btn');
  if (btn.disabled) return;
  // If currently on, this click means "turn off".
  if (btn.classList.contains('on')) {
    return turnOff();
  }
  return turnOn();
}

async function turnOn() {
  const btn = document.getElementById('enable-btn');
  if (!firebaseApp) {
    toast('Reminders not set up yet on this site. (Owner: fill in firebase-config.js.)');
    return;
  }
  if (isIOS() && !isStandalone()) {
    openSheet('ios-sheet');
    return;
  }
  btn.disabled = true;
  setPushMsg('Asking permission…');
  try {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setPushMsg('This browser does not support reminders.'); return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { setPushMsg('Permission not granted. You can try again any time.'); return; }
    const supported = await messagingSupported().catch(() => false);
    if (!supported) { setPushMsg('This browser does not support web push.'); return; }
    if (!messaging) messaging = getMessaging(firebaseApp);
    const reg = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
    await navigator.serviceWorker.ready;
    const token = await getToken(messaging, {
      vapidKey: CONFIG.vapidKey,
      serviceWorkerRegistration: reg
    });
    if (!token) { setPushMsg('Could not get a push token.'); return; }
    await ensureAuth();
    await writeSubscription(token);
    localStorage.setItem(LS_PUSH_ON, '1');
    setPushOn(true);
  } catch (e) {
    console.error(e);
    setPushMsg('Something went wrong: ' + (e?.message || e));
  } finally {
    btn.disabled = false;
  }
}

async function turnOff() {
  const btn = document.getElementById('enable-btn');
  btn.disabled = true;
  setPushMsg('Turning off…');
  try {
    // Delete the FCM token so this device stops receiving pushes.
    if (messaging) {
      try { await deleteToken(messaging); } catch (e) { console.warn('deleteToken', e); }
    }
    // Remove this device's subscriber row so the admin script won't target it.
    if (auth?.currentUser && db) {
      try { await remove(ref(db, `subs/${auth.currentUser.uid}`)); } catch (e) { console.warn('remove sub', e); }
    }
    localStorage.removeItem(LS_PUSH_ON);
    setPushOn(false);
    setPushMsg('Reminders are off. Tap the button to turn them back on.');
  } finally {
    btn.disabled = false;
  }
}

function setPushOn(on) {
  const b = document.getElementById('enable-btn');
  if (on) {
    b.classList.add('on');
    b.textContent = '✓ Reminders are on — tap to turn off';
    setPushMsg('You’ll be pinged at the times you’ve picked above.');
  } else {
    b.classList.remove('on');
    b.textContent = 'Turn on reminders';
  }
}
function setPushMsg(t) { document.getElementById('push-msg').textContent = t || ''; }

async function ensureAuth() {
  if (!auth) throw new Error('Firebase not configured.');
  if (auth.currentUser) return auth.currentUser;
  await signInAnonymously(auth);
  return new Promise(resolve => {
    const off = onAuthStateChanged(auth, u => { if (u) { off(); resolve(u); } });
  });
}

async function writeSubscription(token) {
  const s = getSchedule();
  const u = auth.currentUser;
  await set(ref(db, `subs/${u.uid}`), {
    token,
    freq: s.freq,
    day: (s.freq === 'weekly' || s.freq === 'biweekly') ? s.day : null,
    times: s.times,
    biwBucket: s.freq === 'biweekly' ? (s.biwBucket ?? 0) : null,
    updatedAt: serverTimestamp()
  });
}

// Called whenever schedule changes — only writes if we already have a token + auth.
async function syncSubscription() {
  if (!firebaseApp || !auth?.currentUser || !messaging) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('./firebase-messaging-sw.js');
    if (!reg) return;
    const token = await getToken(messaging, { vapidKey: CONFIG.vapidKey, serviceWorkerRegistration: reg });
    if (!token) return;
    await writeSubscription(token);
  } catch (e) { console.warn('syncSubscription', e); }
}

// =====================================================================
//  Foreground push handling
// =====================================================================
function setupForegroundPush() {
  if (!messaging) {
    try { messaging = getMessaging(firebaseApp); } catch { return; }
  }
  onMessage(messaging, payload => {
    // Server sends data-only payloads — read from data, fall back to notification just in case.
    const data = payload?.data || payload?.notification || {};
    const title = data.title || 'Stretch Goals';
    const body  = data.body  || 'Time to stretch.';
    // Use the SW so behavior matches background pushes (icon path, click target, etc.).
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, {
          body,
          icon:  './icons/icon-192.png',
          badge: './icons/icon-192.png',
          tag: 'stretch-goals',
          renotify: true
        });
      });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: './icons/icon-192.png' });
    }
    toast(body);
  });
}

// =====================================================================
//  Service worker (app shell)
// =====================================================================
async function registerAppSW() {
  if (!('serviceWorker' in navigator)) return;
  try { await navigator.serviceWorker.register('./sw.js'); } catch (e) { console.warn(e); }
}

// =====================================================================
//  Init
// =====================================================================
function init() {
  bindMenu();
  bindFreqSheet();
  bindTimeSheet();
  bindDoneBtn();
  bindEnable();
  document.getElementById('freq-btn').addEventListener('click', openFreqSheet);
  document.getElementById('time-btn').addEventListener('click', openTimeSheet);

  renderSentence();
  renderStreak();
  registerAppSW();

  // Reflect saved state. The user is considered "on" only if BOTH the
  // browser still has permission AND they haven't toggled off in-app.
  const permGranted = 'Notification' in window && Notification.permission === 'granted';
  const userWantsOn = localStorage.getItem(LS_PUSH_ON) === '1';
  if (firebaseApp && permGranted && userWantsOn) {
    setPushOn(true);
    setupForegroundPush();
    ensureAuth().then(() => syncSubscription()).catch(() => {});
  } else if (isIOS() && !isStandalone()) {
    setPushMsg('To get reminders on iPhone, add this page to your Home Screen first.');
  }
}

document.addEventListener('DOMContentLoaded', init);
