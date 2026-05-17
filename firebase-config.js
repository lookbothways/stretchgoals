// =======================================================================
//  Stretch Goals — Firebase config.
//  Safe to commit. These are public web keys; security is enforced by the
//  Realtime Database rules in SETUP.md, not by these values.
// =======================================================================

self.STRETCH_CONFIG = {
  firebase: {
    apiKey:            "AIzaSyB8ufN9YDNuBFYPJq3RsROWsm9tAhRFdNU",
    authDomain:        "lbwstretchgoals.firebaseapp.com",
    projectId:         "lbwstretchgoals",
    databaseURL:       "https://lbwstretchgoals-default-rtdb.europe-west1.firebasedatabase.app",
    appId:             "1:414541520257:web:7dbe1eeea5a60ca2721c80",
    messagingSenderId: "414541520257"
  },
  // The VAPID web-push public key (Project Settings → Cloud Messaging → Web Push certificates).
  vapidKey: "BEcxgL3uV1wnFEgq19LKTgezFF4-K0uFgJydD9BfwZkAimFvjZUlU2hYGuWnDUgSqy-1Y79lUBPVeF_GnyLpIw8",
  adminUrl: "https://github.com/lookbothways/stretchgoals/actions"
};
