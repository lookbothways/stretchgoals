# Stretch Goals — setup

One-time setup. ~20 minutes. Everything stays on the free tier forever.

## What you're building

- A PWA at `https://YOUR_USER.github.io/YOUR_REPO/` that people can add to their Home Screen.
- A Firebase project on the Spark (free) plan. We use only **Cloud Messaging** for pushes and **Realtime Database** to store anonymous push tokens. **Do not upgrade to Blaze.** Spark fails closed when free limits hit — that's the safety net you asked for.
- A GitHub Action you trigger manually to send pushes.

---

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> → **Add project**. Name it whatever — e.g. `stretch-goals`. Disable Google Analytics (we don't need it; less data = better privacy).
2. Confirm you're on the **Spark** plan (left rail, under project name). If a banner says "Upgrade to Blaze," ignore it.

## 2. Register the web app

1. Project overview → tap the `</>` (Web) icon → app nickname `stretch-goals-web` → **Register app**.
2. You'll see a `firebaseConfig` object. Copy `apiKey`, `authDomain`, `projectId`, `appId`, `messagingSenderId`.
3. Skip the SDK install step. Click **Continue to console**.

## 3. Enable Anonymous Authentication

Authentication → **Get started** → **Sign-in method** tab → **Anonymous** → Enable → **Save**.

(Anonymous auth gives each device a random UID so it can write its own token to the database. No emails, no identity.)

## 4. Enable Realtime Database

1. Build → **Realtime Database** → **Create database**.
2. Pick a location closest to your users (e.g. `europe-west1`).
3. Start in **Locked mode**.
4. After it's created, copy the database URL from the top of the page (looks like `https://YOUR-PROJECT-default-rtdb.europe-west1.firebasedatabase.app`).
5. Go to the **Rules** tab and paste this exactly, then **Publish**:

```json
{
  "rules": {
    "subs": {
      "$uid": {
        ".read":  "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid",
        "token":     { ".validate": "newData.isString() && newData.val().length < 500" },
        "freq":      { ".validate": "newData.isString() && newData.val().length < 20" },
        "day":       { ".validate": "newData.val() === null || (newData.isString() && newData.val().length < 5)" },
        "times":     { ".validate": "newData.hasChildren() || newData.isString()" },
        "biwBucket": { ".validate": "newData.val() === null || newData.isNumber()" },
        "updatedAt": { ".validate": "newData.isNumber()" },
        "$other":    { ".validate": false }
      }
    }
  }
}
```

These rules say: each device may only write its own row, no one but your service account can read anything, and only those exact fields are accepted. If someone tried to "inject" data, the rules reject it — and there's no PII in there anyway.

## 5. Get the VAPID key

Project Settings (gear icon) → **Cloud Messaging** tab → scroll to **Web configuration** → **Web Push certificates** → **Generate key pair** → copy the value. (It's a long base64 string.)

## 6. Fill in `firebase-config.js`

Open `firebase-config.js` in this repo and replace the `REPLACE_ME_*` values:

```js
self.STRETCH_CONFIG = {
  firebase: {
    apiKey:            "AIzaSy...",
    authDomain:        "stretch-goals.firebaseapp.com",
    projectId:         "stretch-goals",
    databaseURL:       "https://stretch-goals-default-rtdb.europe-west1.firebasedatabase.app",
    appId:             "1:1234567890:web:abc123",
    messagingSenderId: "1234567890"
  },
  vapidKey: "BPa...long...",
  adminUrl: "https://github.com/YOUR_USER/YOUR_REPO/actions"
};
```

Note: this file is **public** (it's in your GitHub repo and served to every visitor). That's normal and safe — Firebase web configs are designed to be public; security is enforced by the database rules above. The VAPID **public** key is also fine to expose.

## 7. Create a service account for the GitHub Action

This is the secret that lets your Action send pushes.

1. Project Settings → **Service accounts** tab → **Generate new private key** → confirm → a JSON file downloads.
2. Open the JSON in a text editor and copy the **entire contents** (it's one JSON object).
3. In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**.
   - Name: `FIREBASE_SERVICE_ACCOUNT`
   - Value: paste the whole JSON.
4. **Delete the downloaded file from your computer.** (The secret is now in GitHub; the local copy is just a liability.)

## 8. Push to GitHub and turn on GitHub Pages

1. Push this repo to GitHub. Public repo is fine — there are no secrets in the code.
2. **Settings → Pages** → Source: **Deploy from a branch**, Branch: `main` (root). Save.
3. Wait a minute, then visit `https://YOUR_USER.github.io/YOUR_REPO/`. You should see the **Stretch Goals** screen.

## 9. Test a push

1. Visit the site on your phone.
2. **iPhone:** tap Share → Add to Home Screen → open from Home Screen → tap **Turn on reminders** → allow.
   **Android:** just tap **Turn on reminders** → allow. (Optionally install when Chrome prompts.)
3. Make sure your schedule is set to the time slot you're about to test (e.g. "daily, morning"), and that today's day matches.
4. On GitHub: **Actions → Send physio reminder → Run workflow**.
   - Time slot: `morn` (or whatever matches your schedule)
   - **Dry run: ✓** for the first attempt — the log will say e.g. "matched 1 subscriber".
5. Real run: same again, **Dry run: ✗**. Your phone should buzz within seconds.

## 10. Day-to-day

- To send: GitHub mobile app → your repo → Actions → Send physio reminder → Run. Edit the message, pick the time slot, run.
- You'll see the run log: how many people matched, how many got pushed. No names, no identities.
- The tap menu on the site includes an **Admin** link that just deep-links to your Actions page.

---

## Privacy notes

- No accounts, no emails, no cookies.
- Each device gets a random Firebase Anonymous UID. Under that UID you can see: an FCM token (an opaque string), the chosen frequency/day/times, and a timestamp. **Nothing more.**
- You cannot link those UIDs to people. Your subscribers are anonymous to you.
- Aggregate counts you can see: how many devices are subscribed total, and broken down by schedule (visible in the Action's log on each run).
- If a user taps **Forget my settings**, their row is deleted and their token is revoked.

## Cost guard-rails

- **Stay on Spark.** Never click "Upgrade to Blaze." Spark = $0, and operations stop cleanly when free limits are hit.
- Spark gives 1 GB RTDB storage and 10 GB/month bandwidth — tens of thousands of stored subscribers and many thousands of pushes a day comfortably. You will not hit this.
- FCM messaging itself is free with no documented quotas.
- GitHub Pages free tier: 100 GB/month bandwidth. Not a concern.
- GitHub Actions free tier on a public repo: unlimited.

## When something goes wrong

- **No push arrived.** Re-run with Dry run. If "matched 0", your phone's schedule doesn't match the time slot or day you sent. If "matched 1, fail 1", look at the error code in the log — `registration-token-not-registered` means the browser uninstalled the push; have the user tap "Turn on reminders" again.
- **iPhone won't subscribe.** It almost certainly isn't running from the Home Screen icon. Open Safari, Share → Add to Home Screen, then open from there.
- **You see "Firebase: Error (auth/admin-restricted-operation)"** in the browser. Anonymous Auth wasn't enabled in step 3.
- **Rules rejected the write.** Check that the rules in step 4 were pasted exactly, and that Anonymous Auth is enabled.
