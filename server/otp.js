import crypto from 'node:crypto';
import { db } from './db.js';

const OTP_TTL_MS = 10 * 60 * 1000; // code valid for 10 minutes
const RESEND_COOLDOWN_MS = 30 * 1000; // wait 30 s before asking for another code
const MAX_REQUESTS_PER_HOUR = 5; // SMS per mobile number per hour
const MAX_ATTEMPTS = 5; // wrong guesses allowed per code
const DAILY_SMS_LIMIT = Number(process.env.SMS_DAILY_LIMIT || 300); // whole-site cap, protects your SMS balance

const secret = () => process.env.JWT_SECRET || 'dev-only-secret-change-me';
const hashCode = (contact, code) =>
  crypto.createHmac('sha256', secret()).update(`${contact}:${code}`).digest('hex');

// ---------- mobile number parsing ----------
/** Accepts Indian mobile numbers (10 digits starting 6-9, optional +91 / 91). Returns { type: 'phone', value: '+91XXXXXXXXXX' } or null. */
export function parseContact(raw) {
  const digits = String(raw || '').replace(/[\s\-()]/g, '');
  if (/^(\+?91)?[6-9]\d{9}$/.test(digits)) return { type: 'phone', value: '+91' + digits.slice(-10) };
  return null;
}

// ---------- SMS delivery ----------
// Provider is chosen by which settings exist: FAST2SMS_API_KEY, else the three TWILIO_* values.
const smsProvider = () => {
  if (process.env.FAST2SMS_API_KEY) return 'fast2sms';
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM) return 'twilio';
  return null;
};
export const smsAvailable = () => Boolean(smsProvider());

async function sendFast2sms(phone, code) {
  const number = phone.slice(-10); // Fast2SMS wants the 10-digit number
  const route = process.env.FAST2SMS_ROUTE === 'q' ? 'q' : 'otp'; // 'otp' = OTP route, 'q' = Quick SMS (custom text)
  const body =
    route === 'q'
      ? { route, message: `Campus Reporter code: ${code}. Valid for 10 minutes.`, numbers: number, flash: 0 }
      : { route, variables_values: code, numbers: number, flash: 0 };
  const res = await fetch(process.env.FAST2SMS_URL || 'https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: { authorization: process.env.FAST2SMS_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.return !== true) {
    throw new Error(`Fast2SMS rejected the request (HTTP ${res.status}): ${[].concat(data.message ?? 'no details').join(' ')}`);
  }
}

async function sendTwilio(phone, code) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: phone, From: process.env.TWILIO_FROM, Body: `Campus Reporter code: ${code}. Valid for 10 minutes.` }),
  });
  if (!res.ok) throw new Error(`Twilio returned HTTP ${res.status}`);
}

/** Sends the code to the phone by SMS. The code is never printed in the logs or returned by the API. */
export async function deliver(phone, code) {
  const provider = smsProvider();
  if (provider === 'fast2sms') await sendFast2sms(phone, code);
  else if (provider === 'twilio') await sendTwilio(phone, code);
  else throw new Error('No SMS provider configured');
  return 'sms';
}

// Whole-site daily cap on real SMS messages (a bot spamming the form cannot drain your balance).
let smsDay = '';
let smsToday = 0;
function underDailyCap() {
  const day = new Date().toISOString().slice(0, 10);
  if (day !== smsDay) { smsDay = day; smsToday = 0; }
  return smsToday < DAILY_SMS_LIMIT;
}

// ---------- public API used by the routes ----------
export async function requestOtp({ name, rollNo, contact }) {
  if (!smsAvailable()) {
    return { error: 'SMS verification is not set up on this site yet. The administrator needs to add the SMS API key.', status: 503 };
  }
  const now = Date.now();
  const recent = db
    .prepare('SELECT created_at FROM otps WHERE contact = ? AND created_at > ? ORDER BY created_at DESC')
    .all(contact.value, now - 60 * 60 * 1000);
  if (recent.length && now - recent[0].created_at < RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - recent[0].created_at)) / 1000);
    return { error: `Please wait ${wait}s before asking for another code`, status: 429 };
  }
  if (recent.length >= MAX_REQUESTS_PER_HOUR) {
    return { error: 'Too many codes requested for this number. Please try again in an hour.', status: 429 };
  }
  if (!underDailyCap()) {
    return { error: 'Verification is temporarily unavailable (daily SMS limit reached). Please try again tomorrow or contact the administrator.', status: 503 };
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  let delivery;
  try {
    delivery = await deliver(contact.value, code);
  } catch (err) {
    console.error('OTP delivery failed:', err.message);
    return { error: 'Could not send the SMS. Please check the number and try again in a minute.', status: 502 };
  }
  smsToday++;

  // Older codes stay in the table (they still count toward the hourly limit); verification only uses the newest.
  db.prepare(
    `INSERT INTO otps (contact, contact_type, code_hash, name, roll_no, expires_at, created_at)
     VALUES (?, 'phone', ?, ?, ?, ?, ?)`
  ).run(contact.value, hashCode(contact.value, code), name, rollNo, now + OTP_TTL_MS, now);
  db.prepare('DELETE FROM otps WHERE created_at < ?').run(now - 2 * 60 * 60 * 1000); // tidy rows older than 2 h

  return { ok: true, delivery };
}

export function verifyOtp({ contact, code }) {
  const now = Date.now();
  const row = db
    .prepare('SELECT * FROM otps WHERE contact = ? AND expires_at > ? ORDER BY id DESC LIMIT 1')
    .get(contact.value, now);
  if (!row) return { error: 'This code has expired or was never sent. Please request a new one.', status: 400 };
  if (row.attempts >= MAX_ATTEMPTS) {
    return { error: 'Too many wrong attempts. Please request a new code.', status: 429 };
  }

  const given = Buffer.from(hashCode(contact.value, String(code || '').trim()));
  const expected = Buffer.from(row.code_hash);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    db.prepare('UPDATE otps SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    const left = MAX_ATTEMPTS - row.attempts - 1;
    return { error: left > 0 ? `Wrong code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many wrong attempts. Please request a new code.', status: 400 };
  }

  db.prepare('UPDATE otps SET expires_at = ? WHERE contact = ?').run(now, contact.value); // a code works only once
  return { ok: true, name: row.name, rollNo: row.roll_no, contactType: 'phone' };
}
