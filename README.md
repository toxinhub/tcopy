# tcopy

A responsive, installable notebook-style web app for quickly saving text and syncing it across signed-in devices.

**Live site:** https://toxinhub.github.io/tcopy/

## Stack
- GitHub Pages for static hosting
- Firebase Authentication (email/password)
- Cloud Firestore with realtime listeners
- Firestore Security Rules
- PWA app shell (manifest + service worker)

This repository uses the dedicated Firebase project `tcopy-12865` and must remain completely separate from other projects. Do not reuse another project's Firebase/Supabase configuration, database, auth, or secrets.

## 1. Create the Firebase project
1. Open https://console.firebase.google.com/ and use the dedicated Firebase project **`tcopy-12865`** (Project ID). Keep it separate from every other app/project.
2. In Project settings → General → Your apps, add a **Web app**.
3. The web app configuration for `tcopy-12865` is already connected in `index.html`.
   - The web config/API key is intended for the browser. Do **not** put a service-account JSON or Admin SDK private key in this repository.
4. In Authentication → Sign-in method, enable **Email/Password**.
5. In Authentication → Settings → Authorized domains, add **`toxinhub.github.io`**.
6. In Firestore Database, create a database. Choose a nearby supported region carefully; the database location cannot be changed later.
7. From a trusted computer with Firebase CLI installed, run `firebase login` followed by `firebase deploy --only firestore:rules,firestore:indexes`. The repository includes `firebase.json` and `.firebaserc` for project `tcopy-12865`.

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
async function main() {
  await getAuth().setCustomUserClaims("PASTE_AUTH_UID_HERE", { admin: true });
}
main().catch(console.error);
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


## Automatic note tagging

tcopy generates up to four topic tags after a new note is saved. Existing manually entered tags are preserved, AI tags are merged without duplicates, and saving the note is not blocked if AI tagging fails.

### One-time Firebase setup
1. In Firebase Console for project `tcopy-12865`, open **AI Services → AI Logic** and complete **Get started** with the Gemini Developer API provider.
2. Firebase AI Logic is initialized directly in the app; no reCAPTCHA Enterprise site key is configured in the client.
3. In **App Check**, keep Firebase AI Logic in **Monitoring** (not **Enforced**) if you want AI requests to work without registering an App Check provider. Direct client-side AI access without App Check has weaker abuse protection, so monitor usage and quotas.
4. Never add a Gemini API key or reCAPTCHA secret key to this repository.

**Privacy:** automatic tagging sends note text to Google through Firebase AI Logic for analysis, including text from Private notes. Avoid storing highly sensitive information in notes if you do not want it processed by the AI service. Only generated tags are written back to Firestore.
