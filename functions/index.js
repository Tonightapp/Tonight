/**
 * Tonight Vietnam — Firebase Cloud Functions
 *
 * Two core functions:
 *  1. onEventApproved  — fires when admin approves an event → emails all users in that city
 *  2. sendReminders    — runs daily at 10:00 AM Vietnam time → emails users about tomorrow's events
 *
 * SETUP (run once before deploying):
 *   firebase functions:secrets:set EMAIL_USER    ← your Gmail address
 *   firebase functions:secrets:set EMAIL_PASS    ← your Gmail App Password (not your normal password)
 *   firebase functions:secrets:set EMAIL_FROM    ← "Tonight Vietnam <noreply@yourdomain.com>"
 *
 *   How to get a Gmail App Password:
 *   Google Account → Security → 2-Step Verification → App passwords → Generate
 *
 * DEPLOY:
 *   cd functions && npm install
 *   firebase deploy --only functions
 */

const { onDocumentUpdated }          = require('firebase-functions/v2/firestore');
const { onSchedule }                 = require('firebase-functions/v2/scheduler');
const { defineSecret }               = require('firebase-functions/params');
const { initializeApp }              = require('firebase-admin/app');
const { getFirestore, Timestamp }    = require('firebase-admin/firestore');
const nodemailer                     = require('nodemailer');

initializeApp();
const db = getFirestore();

// ── Secrets (set via: firebase functions:secrets:set EMAIL_USER etc.) ──────────
const EMAIL_USER = defineSecret('EMAIL_USER');
const EMAIL_PASS = defineSecret('EMAIL_PASS');
const EMAIL_FROM = defineSecret('EMAIL_FROM');

// ── Helper: build transporter ──────────────────────────────────────────────────
function makeTransporter(user, pass) {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

// ── Helper: get users to notify for a city ────────────────────────────────────
async function getUsersForCity(city) {
  // Get users who are in the same city OR have no city set (global)
  const snap = await db.collection('users')
    .where('city', 'in', [city, '', null])
    .limit(500)
    .get();
  return snap.docs.map(d => d.data()).filter(u => u.email);
}

// ── Helper: also grab ALL users if city list doesn't match (safety net) ───────
async function getAllUsers() {
  const snap = await db.collection('users').limit(500).get();
  return snap.docs.map(d => d.data()).filter(u => u.email);
}

// ══════════════════════════════════════════════════════════════════════════════
// FUNCTION 1: onEventApproved
// Triggers whenever an event document is updated.
// When status changes to 'approved' → blast email to all users in that city.
// ══════════════════════════════════════════════════════════════════════════════
exports.onEventApproved = onDocumentUpdated(
  {
    document: 'events/{eventId}',
    secrets:  [EMAIL_USER, EMAIL_PASS, EMAIL_FROM],
    region:   'asia-southeast1',
  },
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();

    // Only run when status flips to 'approved' and email not already sent
    if (before.status === 'approved' || after.status !== 'approved') return;
    if (after.emailSent) return;

    const ev      = after;
    const eventId = event.params.eventId;

    console.log(`[onEventApproved] Event approved: "${ev.title}" in ${ev.city}`);

    let users = await getUsersForCity(ev.city);
    // If no city-specific users, notify everyone
    if (users.length === 0) users = await getAllUsers();

    if (users.length === 0) {
      console.log('[onEventApproved] No users to notify.');
      await event.data.after.ref.update({ emailSent: true, emailSentAt: Timestamp.now(), emailCount: 0 });
      return;
    }

    const transporter = makeTransporter(EMAIL_USER.value(), EMAIL_PASS.value());
    const fromLabel   = EMAIL_FROM.value() || `Tonight Vietnam <${EMAIL_USER.value()}>`;

    // Send emails (batch to avoid rate limits)
    let sent = 0;
    const batchSize = 50;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);
      await Promise.allSettled(batch.map(user =>
        transporter.sendMail({
          from:    fromLabel,
          to:      user.email,
          subject: `${ev.emoji || '🎉'} ${ev.title} — ${ev.venueName} · Tonight Vietnam`,
          html:    buildApprovalEmail(ev, user),
        }).then(() => sent++)
          .catch(err => console.error(`[email error] ${user.email}: ${err.message}`))
      ));
    }

    console.log(`[onEventApproved] Sent ${sent}/${users.length} emails`);

    // Mark email sent on the event doc
    await event.data.after.ref.update({
      emailSent:    true,
      emailSentAt:  Timestamp.now(),
      emailCount:   sent,
    });
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// FUNCTION 2: sendReminders
// Runs daily at 10:00 AM Vietnam time (UTC+7 = 03:00 UTC).
// Finds all approved events happening TOMORROW and sends reminder emails.
// ══════════════════════════════════════════════════════════════════════════════
exports.sendReminders = onSchedule(
  {
    schedule:  'every day 03:00',   // 03:00 UTC = 10:00 AM Ho Chi Minh City
    timeZone:  'UTC',
    secrets:   [EMAIL_USER, EMAIL_PASS, EMAIL_FROM],
    region:    'asia-southeast1',
  },
  async () => {
    // Get tomorrow's date string YYYY-MM-DD (Vietnam time)
    const now       = new Date();
    const tomorrow  = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr   = tomorrow.toISOString().split('T')[0];

    console.log(`[sendReminders] Looking for events on ${dateStr}`);

    const eventsSnap = await db.collection('events')
      .where('date', '==', dateStr)
      .where('status', '==', 'approved')
      .where('reminderSent', '==', false)
      .get();

    if (eventsSnap.empty) {
      console.log('[sendReminders] No events tomorrow — nothing to do.');
      return;
    }

    console.log(`[sendReminders] Found ${eventsSnap.size} event(s) for ${dateStr}`);

    const transporter = makeTransporter(EMAIL_USER.value(), EMAIL_PASS.value());
    const fromLabel   = EMAIL_FROM.value() || `Tonight Vietnam <${EMAIL_USER.value()}>`;

    for (const eventDoc of eventsSnap.docs) {
      const ev = eventDoc.data();

      let users = await getUsersForCity(ev.city);
      if (users.length === 0) users = await getAllUsers();

      let sent = 0;
      const batchSize = 50;
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);
        await Promise.allSettled(batch.map(user =>
          transporter.sendMail({
            from:    fromLabel,
            to:      user.email,
            subject: `⏰ Tomorrow: ${ev.emoji || '🎉'} ${ev.title} at ${ev.venueName} — Don't miss it`,
            html:    buildReminderEmail(ev, user),
          }).then(() => sent++)
            .catch(err => console.error(`[reminder error] ${user.email}: ${err.message}`))
        ));
      }

      console.log(`[sendReminders] "${ev.title}": sent ${sent} reminders`);
      await eventDoc.ref.update({ reminderSent: true, reminderSentAt: Timestamp.now() });
    }
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// EMAIL TEMPLATES
// ══════════════════════════════════════════════════════════════════════════════

function buildApprovalEmail(ev, user) {
  const firstName  = (user.fullName || user.email.split('@')[0]).split(' ')[0];
  const priceText  = (!ev.price || ev.price === 0) ? 'Free Entry' : `${Number(ev.price).toLocaleString()} VND`;
  const dateFormatted = ev.date
    ? new Date(ev.date).toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080810;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080810;padding:32px 16px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">

  <!-- HEADER -->
  <tr><td style="text-align:center;padding-bottom:24px">
    <div style="display:inline-block;background:rgba(245,200,66,0.1);border:1px solid rgba(245,200,66,0.3);border-radius:12px;padding:8px 18px">
      <span style="color:#f5c842;font-size:16px;font-weight:800;letter-spacing:2px">🌙 TONIGHT VIETNAM</span>
    </div>
  </td></tr>

  <!-- FLYER CARD -->
  <tr><td style="background:linear-gradient(135deg,#13131f 0%,#0e0e1a 100%);border:1px solid rgba(245,200,66,0.2);border-radius:20px;overflow:hidden">

    <!-- EVENT EMOJI BANNER -->
    <div style="background:linear-gradient(135deg,rgba(245,200,66,0.15) 0%,rgba(245,200,66,0.05) 100%);padding:40px 32px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.07)">
      <div style="font-size:64px;margin-bottom:16px">${ev.emoji || '🎉'}</div>
      <h1 style="color:#ffffff;font-size:28px;font-weight:800;margin:0 0 8px;letter-spacing:-0.5px;line-height:1.2">${escHtml(ev.title)}</h1>
      <p style="color:#f5c842;font-size:16px;font-weight:600;margin:0">${escHtml(ev.venueName)}</p>
      <p style="color:#94a3b8;font-size:14px;margin:4px 0 0">${escHtml(ev.city || '')}</p>
    </div>

    <!-- EVENT DETAILS -->
    <div style="padding:32px">
      <!-- Greeting -->
      <p style="color:#f1f5f9;font-size:16px;margin:0 0 24px">
        Hey ${escHtml(firstName)},<br/><br/>
        A new event just dropped that you don't want to miss 👇
      </p>

      <!-- Details Table -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px">
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.07)">
            <span style="color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600">📅 Date</span><br/>
            <span style="color:#f1f5f9;font-size:15px;font-weight:600;margin-top:4px;display:block">${escHtml(dateFormatted)}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.07)">
            <span style="color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600">⏰ Time</span><br/>
            <span style="color:#f1f5f9;font-size:15px;font-weight:600;margin-top:4px;display:block">${escHtml(ev.time || 'Doors open from 9PM')}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.07)">
            <span style="color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600">🎵 Type</span><br/>
            <span style="color:#f1f5f9;font-size:15px;font-weight:600;margin-top:4px;display:block">${escHtml(ev.genre || 'Special Event')}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 0">
            <span style="color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600">🎟️ Entry</span><br/>
            <span style="color:${!ev.price || ev.price === 0 ? '#22c55e' : '#f5c842'};font-size:15px;font-weight:700;margin-top:4px;display:block">${escHtml(priceText)}</span>
          </td>
        </tr>
      </table>

      <!-- Description -->
      ${ev.description ? `<p style="color:#94a3b8;font-size:14px;line-height:1.7;margin:0 0 28px;padding:16px;background:rgba(255,255,255,0.04);border-radius:10px;border-left:3px solid rgba(245,200,66,0.4)">${escHtml(ev.description)}</p>` : ''}

      <!-- CTA -->
      <div style="text-align:center">
        <a href="https://tonightvietnam.com" style="display:inline-block;background:#f5c842;color:#000;font-size:15px;font-weight:700;padding:16px 40px;border-radius:12px;text-decoration:none;letter-spacing:0.3px">
          View Event on Tonight Vietnam →
        </a>
      </div>
    </div>

  </td></tr>

  <!-- FOOTER -->
  <tr><td style="text-align:center;padding:24px 0">
    <p style="color:#475569;font-size:12px;margin:0 0 8px">Tonight Vietnam · Discover the best nightlife in Vietnam</p>
    <p style="color:#475569;font-size:11px;margin:0">
      You're receiving this because you joined Tonight Vietnam in ${escHtml(user.city || 'Vietnam')}.<br/>
      <a href="https://tonightvietnam.com/unsubscribe?email=${encodeURIComponent(user.email)}" style="color:#475569">Unsubscribe</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildReminderEmail(ev, user) {
  const firstName  = (user.fullName || user.email.split('@')[0]).split(' ')[0];
  const priceText  = (!ev.price || ev.price === 0) ? 'Free Entry' : `${Number(ev.price).toLocaleString()} VND`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080810;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#080810;padding:32px 16px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">

  <!-- REMINDER BANNER -->
  <tr><td style="background:linear-gradient(135deg,rgba(239,68,68,0.15),rgba(239,68,68,0.05));border:1px solid rgba(239,68,68,0.3);border-radius:16px;padding:16px 24px;text-align:center;margin-bottom:20px">
    <p style="color:#ef4444;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0">⏰ HAPPENING TOMORROW</p>
  </td></tr>

  <tr><td style="height:16px"></td></tr>

  <!-- MAIN CARD -->
  <tr><td style="background:#13131f;border:1px solid rgba(245,200,66,0.2);border-radius:20px;overflow:hidden">
    <div style="background:linear-gradient(135deg,rgba(245,200,66,0.12) 0%,rgba(245,200,66,0.04) 100%);padding:36px 32px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.07)">
      <div style="font-size:56px;margin-bottom:12px">${ev.emoji || '🎉'}</div>
      <h1 style="color:#ffffff;font-size:26px;font-weight:800;margin:0 0 8px">${escHtml(ev.title)}</h1>
      <p style="color:#f5c842;font-size:15px;font-weight:600;margin:0">${escHtml(ev.venueName)} · ${escHtml(ev.city || '')}</p>
    </div>
    <div style="padding:28px 32px;text-align:center">
      <p style="color:#f1f5f9;font-size:16px;margin:0 0 20px">
        Hey ${escHtml(firstName)}, don't forget — <strong style="color:#f5c842">${escHtml(ev.title)}</strong> is tomorrow!
      </p>
      <div style="display:inline-flex;gap:24px;margin-bottom:28px">
        <span style="color:#94a3b8;font-size:14px">🕐 ${escHtml(ev.time || '9:00 PM')}</span>
        &nbsp;&nbsp;
        <span style="color:${!ev.price || ev.price === 0 ? '#22c55e' : '#f5c842'};font-size:14px;font-weight:600">${escHtml(priceText)}</span>
      </div>
      <br/>
      <a href="https://tonightvietnam.com" style="display:inline-block;background:#f5c842;color:#000;font-size:14px;font-weight:700;padding:14px 36px;border-radius:12px;text-decoration:none">
        View Event Details →
      </a>
    </div>
  </td></tr>

  <!-- FOOTER -->
  <tr><td style="text-align:center;padding:20px 0">
    <p style="color:#475569;font-size:11px;margin:0">
      Tonight Vietnam · <a href="https://tonightvietnam.com/unsubscribe?email=${encodeURIComponent(user.email)}" style="color:#475569">Unsubscribe</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
