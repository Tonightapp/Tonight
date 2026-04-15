import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

// TODO: Replace with your Firebase project config from Firebase Console
// Project Settings → General → Your apps → Web app → Config
export const firebaseConfig = {
  apiKey:            'AIzaSyBHASTMA5bMn5uD_3zT7Y8CoY87N2kJGb0',
  authDomain:        'tonight-vietnam.firebaseapp.com',
  projectId:         'tonight-vietnam',
  storageBucket:     'tonight-vietnam.firebasestorage.app',
  messagingSenderId: '838063793192',
  appId:             '1:838063793192:web:595f6ff8fc1a71b474c11d',
  measurementId:     'G-F2ES9FFJGW',
};

// Initialize Firebase app — guard against already-initialized (Expo hot reload)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Auth with AsyncStorage persistence for React Native
export const auth = (() => {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Already initialized (e.g. Expo fast refresh)
    return getAuth(app);
  }
})();

// Firestore — collections: users/{uid}, venue_requests/{id}, events/{id}
export const db = getFirestore(app);

// Storage
export const storage = getStorage(app);
