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
    // TODO: fill this in after step 4 (Enable Realtime Database). It will
    // look like https://lbwstretchgoals-default-rtdb.europe-west1.firebasedatabase.app
    databaseURL:       "BEcxgL3uV1wnFEgq19LKTgezFF4-K0uFgJydD9BfwZkAimFvjZUlU2hYGuWnDUgSqy-1Y79lUBPVeF_GnyLpIw8",
    appId:             "1:414541520257:web:7dbe1eeea5a60ca2721c80",
    messagingSenderId: "414541520257"
  },
  // TODO: from step 5 — Project Settings → Cloud Messaging → Web Push certificates → Generate key pair.
  vapidKey: "REPLACE_ME_vapid_public_key",
  // TODO: replace YOUR_USER once you've pushed to GitHub.
  adminUrl: "https://github.com/YOUR_USER/stretchgoals/actions"
};
