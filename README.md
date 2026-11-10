# tcopy

A responsive, installable notebook-style web app for quickly saving text and syncing it across signed-in devices.

**Live site:** https://toxinhub.github.io/tcopy/

## Stack
- GitHub Pages for static hosting
- Firebase Authentication (email/password)
- Cloud Firestore with realtime listeners
- Firestore Security Rules
- PWA app shell (manifest + service worker)

This repository and Firebase project are intended to be completely separate from other projects. Do not reuse another project's Firebase/Supabase configuration, database, auth, or secrets.

## 1. Create the Firebase project
1. Open https://console.firebase.google.com/ and create a **new project named `tcopy`**.
2. In Project settings → General → Your apps, add a **Web app**.
3. Copy its web app config into the `firebaseConfig` object in `index.html`, replacing each `YOUR_...` placeholder.
   - The web config/API key is intended for the browser. Do **not** put a service-account JSON or Admin SDK private key in this repository.
4. In Authentication → Sign-in method, enable **Email/Password**.
5. In Firestore Database, create a database. Choose a nearby supported region carefully; the database location cannot be changed later.
6. Publish `firestore.rules` in Firestore → Rules.
7. Deploy the included `firestore.indexes.json` using the Firebase CLI if required.

## 2. Enable GitHub Pages
In GitHub → Settings → Pages, choose **Deploy from a branch**, select `main` and `/ (root)`. The app is designed for the `/tcopy/` path.

## 3. Set up the Admin role securely
The Admin button appears only when Firebase verifies the signed-in user's custom claim `admin: true`. A client cannot grant itself this role.

After the first account is created, copy that account's Firebase Authentication UID. Assign the claim from a trusted local environment using Firebase Admin SDK (never from browser code):

```js
// Run only in a trusted local environment with Firebase Admin SDK credentials.
// Keep service-account credentials outside this repository.
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
initializeApp({ credential: applicationDefault() });
await getAuth().setCustomUserClaims("PASTE_AUTH_UID_HERE", { admin: true });
```

Then sign out and sign back in. Admin users can view/manage all clips; regular users can only read and manage their own clips. Keep the admin account secure.

## Data and privacy
- Notes are stored in Firestore under a `clips` collection, each with an `ownerUid`.
- Normal users can only read, edit, and delete their own notes.
- Admin access is based on a Firebase custom claim, not a front-end toggle.
- The service worker caches only static app-shell files; it does not cache Firestore or authentication data.
- Draft text and theme preference may be kept locally on the current device. Saved notes are not stored in localStorage.

## Current scope
This first version includes sign-in, account creation, realtime sync, search, day/week/month grouping (weeks start Saturday), pinning, copy, editing/deleting, light/dark theme, and responsive PWA layout.

Public share links, attachments, and offline writes are not included yet. They can be added later without making private notes public by default.
