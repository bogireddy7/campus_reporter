import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { db } from './db.js';

const OTP_TTL_MS = 10 * 60 * 1000; // code valid for 10 minutes
const RESEND_COOLDOWN_MS = 30 * 1000; // wait 30 s before asking for another code
const MAX_REQUESTS_PER_HOUR = 5; // per email / phone number
const MAX_ATTEMPTS = 5; // wrong guesses allowed per code

const secret = () => process.env.JWT_SECRET || 'dev-only-secret-change-me';
const hashCode = (contact, code) =>
  crypto.createHmac('sha256', secret()).update(`${contact}:${code}`).digest('hex');

// ---------- contact parsing ----------
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Returns { type: 'email' | 'phone', value } or null if it is neither. */
export function parseContact(raw) {
  const input = String(raw || '').trim();
  if (!input) return null;
  if (input.includes('@')) {
    const value = input.toLowerCase().slice(0, 120);
    return EMAIL_RE.test(value) ? { type: 'email', value } : null;
  }
  const digits = input.replace(/[\s\-()]/g, '');
  if (/^(\+?91)?[6-9]\d{9}$/.test(digits)) {
    return { type: 'phone', value: '+91' + digits.slice(-10) }; // Indian mobile numbers
  }
  if (/^\+[1-9]\d{9,14}$/.test(digits)) return { type: 'phone', value: digits }; // other countries
  return null;
}

// ---------- delivery ----------
let mailer = null;
const smtpReady = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const smsReady = () =>
  Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);

async function sendEmail(to, code) {
  mailer ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await mailer.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'Your Campus Reporter verification code',
    text: `Your verification code is ${code}. It is valid for 10 minutes. If you did not ask for it, ignore this message.`,
  });
}

async function sendSms(to, code) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: to,
      From: process.env.TWILIO_FROM,
      Body: `Campus Reporter code: ${code}. Valid for 10 minutes.`,
    }),
  });
  if (!res.ok) throw new Error(`SMS provider returned ${res.status}`);
}

/**
 * Sends the code. When no email/SMS provider is configured the code is printed in the
 * server terminal instead (fine for local testing; set SMTP_* / TWILIO_* for real use).
 * The code is never included in the API response.
 */
const consoleOtpAllowed = () => process.env.NODE_ENV !== 'production' || process.env.ALLOW_CONSOLE_OTP === '1';
export const channelReady = (type) => (type === 'email' ? smtpReady() : smsReady()) || consoleOtpAllowed();

async function deliver(contact, code) {
  if (contact.type === 'email' && smtpReady()) {
    await sendEmail(contact.value, code);
    return 'email';
  }
  if (contact.type === 'phone' && smsReady()) {
    await sendSms(contact.value, code);
    return 'sms';
  }
  console.log(`\n[OTP] No ${contact.type === 'email' ? 'email (SMTP)' : 'SMS'} provider configured. Code for ${contact.value}: ${code}\n`);
  return 'console';
}

// ---------- public API used by the routes ----------
export async function requestOtp({ name, rollNo, contact }) {
  if (!channelReady(contact.type)) {
    return {
      error: `Verification by ${contact.type === 'email' ? 'email' : 'SMS'} is not set up on this site yet. Please try the other option or contact the administrator.`,
      status: 503,
    };
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
    return { error: 'Too many codes requested for this contact. Please try again in an hour.', status: 429 };
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  let delivery;
  try {
    delivery = await deliver(contact, code);
  } catch (err) {
    console.error('OTP delivery failed:', err.message);
    return { error: `Could not send the code to your ${contact.type}. Please check it and try again.`, status: 502 };
  }

  db.prepare('DELETE FROM otps WHERE contact = ? AND expires_at > ?').run(contact.value, now); // only the latest code counts
  db.prepare(
    `INSERT INTO otps (contact, contact_type, code_hash, name, roll_no, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(contact.value, contact.type, hashCode(contact.value, code), name, rollNo, now + OTP_TTL_MS, now);
  db.prepare('DELETE FROM otps WHERE expires_at < ?').run(now - 60 * 60 * 1000); // tidy old rows

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

  db.prepare('DELETE FROM otps WHERE contact = ?').run(contact.value); // a code works only once
  return { ok: true, name: row.name, rollNo: row.roll_no, contactType: row.contact_type };
}
