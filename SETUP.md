# Tonight Vietnam — Setup Guide

## How the system works end-to-end

```
Venue submits event (portal/venue.html)
        ↓
Event saved to Firestore with status: 'pending'
        ↓
Staff sees it in Events tab (portal/index.html) with Approve / Reject
        ↓
Staff clicks "Approve & Publish"
        ↓
Cloud Function fires automatically (functions/index.js)
        ↓
Emails sent to ALL users in that city with event flyer
        ↓
Event appears live on landing.html for everyone to see
        ↓
Day before the event → Cloud Function sends reminder emails
```

---

## Step 1 — Firebase Console Setup

1. Go to https://console.firebase.google.com
2. Create project: **tonight-vietnam**
3. Enable **Authentication** → Sign-in method → Email/Password ✓
4. Enable **Firestore Database** → Start in production mode
5. Go to **Project Settings** → General → Your apps → Add web app → Copy config

---

## Step 2 — Paste Firebase config (do this in 4 files)

Open each file and replace all `PASTE_YOUR_*` values with your real config:

- `portal/index.html` — line ~741
- `portal/join.html` — bottom script block
- `portal/venue.html` — bottom script block
- `portal/landing.html` — bottom script block

Same 6 values in all 4 files:
```js
apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId
```

---

## Step 3 — Create your staff admin account

In Firebase Console → Authentication → Users → Add user
- Email: your admin email
- Password: strong password

Then in Firestore → users collection → add document with ID = your UID:
```json
{
  "email": "your@email.com",
  "fullName": "Admin",
  "role": "staff",
  "createdAt": (timestamp)
}
```

---

## Step 4 — Deploy Firestore rules and indexes

```bash
cd "C:/Users/Admin/tonight-app"
npm install -g firebase-tools
firebase login
firebase use --add   # select tonight-vietnam project
firebase deploy --only firestore
```

---

## Step 5 — Set up email (Gmail App Password)

1. Go to your Google Account → Security → 2-Step Verification → App passwords
2. Generate an app password for "Mail"
3. Run these commands:

```bash
firebase functions:secrets:set EMAIL_USER
# Enter: your.gmail@gmail.com

firebase functions:secrets:set EMAIL_PASS
# Enter: xxxx xxxx xxxx xxxx  (the 16-char app password)

firebase functions:secrets:set EMAIL_FROM
# Enter: Tonight Vietnam <your.gmail@gmail.com>
```

---

## Step 6 — Deploy Cloud Functions

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

This deploys:
- `onEventApproved` — fires when admin approves → emails all users
- `sendReminders` — runs daily at 10AM Vietnam time → reminder emails

---

## Step 7 — Deploy the web portals

```bash
firebase deploy --only hosting
```

Your portals are now live at:
- `https://tonight-vietnam.web.app/` → landing page
- `https://tonight-vietnam.web.app/join.html` → venue signup (send this to venues)
- `https://tonight-vietnam.web.app/index.html` → staff portal
- `https://tonight-vietnam.web.app/venue.html` → venue dashboard

---

## Daily workflow

**Inviting venues:**
→ Send them: `https://tonight-vietnam.web.app/join.html`

**Staff portal:** `https://tonight-vietnam.web.app/index.html`
→ Venues tab: approve/reject venue applications
→ Events tab: approve/reject events (approving triggers automatic emails)

**Venue portal:** `https://tonight-vietnam.web.app/venue.html`
→ Venues log in, submit events, see pending/approved/rejected status

**Emails sent automatically:**
→ On approval: event flyer email to all users in that city
→ Day before: reminder email to all users
