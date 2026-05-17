// =======================================================================
//  EDIT THIS FILE after creating your Firebase project.
//  Paste values from: Firebase console → Project Settings → General →
//  "Your apps" → Web app config.
//  Also paste your VAPID public key from: Cloud Messaging → Web Push certificates.
//  Set adminUrl to your GitHub Actions page.
// =======================================================================

self.STRETCH_CONFIG = {
  firebase: {
    apiKey:            "REPLACE_ME_apiKey",
    authDomain:        "REPLACE_ME.firebaseapp.com",
    projectId:         "REPLACE_ME",
    databaseURL:       "https://REPLACE_ME-default-rtdb.firebaseio.com",
    appId:             "REPLACE_ME_appId",
    messagingSenderId: "REPLACE_ME_senderId"
  },
  vapidKey: "REPLACE_ME_vapid_public_key",
  adminUrl: "https://github.com/REPLACE_ME_user/REPLACE_ME_repo/actions"
};
