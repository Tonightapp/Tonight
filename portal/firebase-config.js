/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  Tonight Vietnam — Shared Firebase Config                        ║
 * ║  Used by all web portals (staff, venue owner, public)            ║
 * ║                                                                  ║
 * ║  SETUP: Replace all PASTE_YOUR_* values below with your          ║
 * ║  Firebase project credentials.                                   ║
 * ║                                                                  ║
 * ║  How to get credentials:                                         ║
 * ║    1. Go to https://console.firebase.google.com                  ║
 * ║    2. Select your project → Project Settings → General           ║
 * ║    3. Under "Your apps", find the web app config                 ║
 * ║    4. Copy each value into the object below                      ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Firebase JS SDK version: 10.12.0 (CDN)
 */

export const FIREBASE_CDN = 'https://www.gstatic.com/firebasejs/10.12.0';

export const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBHASTMA5bMn5uD_3zT7Y8CoY87N2kJGb0",
  authDomain:        "tonight-vietnam.firebaseapp.com",
  projectId:         "tonight-vietnam",
  storageBucket:     "tonight-vietnam.firebasestorage.app",
  messagingSenderId: "838063793192",
  appId:             "1:838063793192:web:595f6ff8fc1a71b474c11d",
  measurementId:     "G-F2ES9FFJGW",
};

export const ADMIN_EMAIL = 'app.tonigh1@gmail.com';

function assertConfigReady() {
  const missing = Object.entries(FIREBASE_CONFIG)
    .filter(([, v]) => typeof v === 'string' && v.startsWith('PASTE_YOUR_'))
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`[Tonight] Firebase config incomplete. Replace: ${missing.join(', ')}`);
  }
}

let _app = null, _auth = null, _db = null;

export async function getFirebase() {
  if (_app) return _app;
  assertConfigReady();
  const { initializeApp, getApps } = await import(`${FIREBASE_CDN}/firebase-app.js`);
  const existing = getApps();
  _app = existing.length > 0 ? existing[0] : initializeApp(FIREBASE_CONFIG);
  return _app;
}

export async function getAuth() {
  if (_auth) return _auth;
  const app = await getFirebase();
  const { getAuth: _getAuth } = await import(`${FIREBASE_CDN}/firebase-auth.js`);
  _auth = _getAuth(app);
  return _auth;
}

export async function getDb() {
  if (_db) return _db;
  const app = await getFirebase();
  const { getFirestore } = await import(`${FIREBASE_CDN}/firebase-firestore.js`);
  _db = getFirestore(app);
  return _db;
}

export function isConfigReady() {
  return !Object.values(FIREBASE_CONFIG).some(
    v => typeof v === 'string' && v.startsWith('PASTE_YOUR_')
  );
}
