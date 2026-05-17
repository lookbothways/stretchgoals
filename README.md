# Stretch Goals

A tiny PWA that nudges people to do their physio. Privacy-first, free forever, no servers.

- **Frontend:** static HTML/CSS/JS, hosted on GitHub Pages.
- **Backend:** Firebase Cloud Messaging + Realtime Database (Spark/free).
- **Admin:** GitHub Actions manual workflow — pick a time slot, type a message, run.

See [`SETUP.md`](SETUP.md) for the one-time setup walkthrough.

## What's where

| Path | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The PWA |
| `firebase-config.js` | The one file you edit with your Firebase keys |
| `manifest.webmanifest` | PWA manifest |
| `sw.js` | App-shell service worker (offline) |
| `firebase-messaging-sw.js` | FCM service worker (push) |
| `icons/` | App icons — replace with real designs when you like |
| `whatsapp-qr.png` | Placeholder — replace with your WhatsApp group QR |
| `.github/workflows/send-reminder.yml` | The admin action |
| `scripts/send-fcm.mjs` | Node script run by the action |

## Privacy model in one paragraph

Each device authenticates as an anonymous Firebase user (no email, no identifier you control). The device writes its FCM push token and chosen schedule to its own row in Realtime Database, which only that device and your service account can read. To send a reminder, the GitHub Action runs your service account against the DB, finds rows whose schedule matches today's day and the chosen time slot, and sends a push to each. You can see aggregate counts but no identities. There are no cookies and no analytics.
