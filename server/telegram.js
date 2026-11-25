// Free phone-number verification through a Telegram bot.
//
// The student opens a link, presses START, and taps "Share my phone number". Telegram itself confirms the
// number (it checks it when the person signs up for Telegram), so no SMS is sent and nothing is charged.
// The server asks Telegram for new messages ("long polling"), so it works on a laptop with no public address.
import crypto from 'node:crypto';
import { db } from './db.js';
import { parseContact } from './otp.js';

const TTL_MS = 10 * 60 * 1000; // the verification link works for 10 minutes
const PICKUP_MS = 5 * 60 * 1000; // after verifying, the website has 5 more minutes to collect the result

const base = () => process.env.TELEGRAM_API_URL || 'https://api.telegram.org';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, body = {}, token = process.env.TELEGRAM_BOT_TOKEN) {
  const res = await fetch(`${base()}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    const err = new Error(`Telegram ${method} failed: ${data.description || `HTTP ${res.status}`}`);
    err.code = data.error_code || res.status;
    throw err;
  }
  return data.result;
}

/** Checks a bot token with Telegram and returns the bot's username (used by "npm run configure"). */
export async function checkBotToken(token) {
  const me = await call('getMe', {}, token);
  return me.username;
}

let botUsername = '';
let ready = false;
export const telegramReady = () => ready && Boolean(botUsername);
export const botName = () => botUsername;

// ---------- verification records ----------
export function createVerification({ name, rollNo }) {
  const now = Date.now();
  const token = crypto.randomBytes(18).toString('base64url'); // 24 URL-safe characters, fits Telegram's /start limit
  db.prepare('DELETE FROM telegram_verifications WHERE expires_at < ?').run(now - 60 * 60 * 1000);
  db.prepare(
    `INSERT INTO telegram_verifications (token, name, roll_no, status, created_at, expires_at)
     VALUES (?, ?, ?, 'pending', ?, ?)`
  ).run(token, name, rollNo, now, now + TTL_MS);
  return token;
}

/** What the website polls. A verified result can be collected only once. */
export function checkVerification(token) {
  const row = db.prepare('SELECT * FROM telegram_verifications WHERE token = ?').get(token);
  if (!row) return { status: 'unknown' };
  const now = Date.now();
  if (row.status === 'used') return { status: 'used' };
  if (row.expires_at < now) return { status: 'expired' };
  if (row.status === 'verified') {
    db.prepare("UPDATE telegram_verifications SET status = 'used' WHERE token = ?").run(token);
    return { status: 'verified', name: row.name, rollNo: row.roll_no, phone: row.phone };
  }
  return { status: row.status }; // pending | awaiting_contact
}

// ---------- the bot ----------
const say = (chatId, text, extra = {}) => call('sendMessage', { chat_id: chatId, text, ...extra });
const shareButton = {
  keyboard: [[{ text: '📱 Share my phone number', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

async function handleMessage(message) {
  const chatId = message.chat?.id;
  const fromId = message.from?.id;
  if (!chatId || !fromId || message.chat.type !== 'private') return;
  const now = Date.now();

  // 1) "/start <token>": the student opened the link from the website
  const start = typeof message.text === 'string' && message.text.match(/^\/start(?:@\w+)?(?:\s+(\S+))?/);
  if (start) {
    const row = start[1] && db.prepare('SELECT * FROM telegram_verifications WHERE token = ?').get(start[1]);
    if (!row || row.expires_at < now || ['verified', 'used'].includes(row.status)) {
      return say(chatId, 'This verification link has expired or was already used.\n\nGo back to the website and press "Verify with Telegram" again.');
    }
    db.prepare("UPDATE telegram_verifications SET chat_id = ?, status = 'awaiting_contact' WHERE token = ?").run(chatId, row.token);
    // Show who the session is for, so nobody confirms a link someone else sent them by mistake.
    return say(
      chatId,
      `Verify your mobile number for Campus Reporter as:\n\n${row.name} (${row.roll_no})\n\nOnly tap the button below if this is you.`,
      { reply_markup: shareButton }
    );
  }

  // 2) the shared contact
  if (message.contact) {
    const row = db
      .prepare("SELECT * FROM telegram_verifications WHERE chat_id = ? AND status = 'awaiting_contact' AND expires_at > ? ORDER BY created_at DESC LIMIT 1")
      .get(chatId, now);
    if (!row) {
      return say(chatId, 'No verification is waiting.\n\nGo to the website and press "Verify with Telegram" to get a new link.');
    }
    // The contact must be the sender's OWN number (not a forwarded or manually picked contact).
    if (message.contact.user_id !== fromId) {
      return say(chatId, 'Please share your own number using the "📱 Share my phone number" button, not another contact.', { reply_markup: shareButton });
    }
    const phone = parseContact('+' + String(message.contact.phone_number || '').replace(/\D/g, ''));
    if (!phone) {
      return say(chatId, 'Only Indian mobile numbers (+91) can be used for Campus Reporter.', { reply_markup: { remove_keyboard: true } });
    }
    db.prepare("UPDATE telegram_verifications SET status = 'verified', phone = ?, expires_at = ? WHERE token = ?").run(phone.value, now + PICKUP_MS, row.token);
    return say(chatId, '✅ Verified! Go back to the website, it will continue automatically.', { reply_markup: { remove_keyboard: true } });
  }

  // 3) anything else
  return say(chatId, 'Hi! This bot only verifies your mobile number for Campus Reporter.\n\nOpen the website, press "Verify with Telegram", then tap the link it gives you.');
}

async function pollLoop() {
  let offset = 0;
  for (;;) {
    try {
      const updates = await call('getUpdates', { offset, timeout: Number(process.env.TELEGRAM_POLL_SECONDS || 25), allowed_updates: ['message'] });
      for (const u of updates) {
        offset = u.update_id + 1;
        try {
          if (u.message) await handleMessage(u.message);
        } catch (err) {
          console.error('Telegram message error:', err.message);
        }
      }
    } catch (err) {
      if (err.code === 401) {
        console.error('Telegram: the bot token is not valid, so Telegram verification is OFF. Check TELEGRAM_BOT_TOKEN.');
        ready = false;
        return;
      }
      if (err.code === 409) console.error('Telegram: another copy of this site is already using this bot. Run only one copy at a time. Retrying...');
      else console.error('Telegram polling problem (will retry):', err.message);
      await sleep(5000);
    }
  }
}

/** Called once when the server starts. Does nothing if no bot token is configured. */
export async function startTelegram() {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;
  try {
    botUsername = await checkBotToken(process.env.TELEGRAM_BOT_TOKEN);
    await call('deleteWebhook', {}).catch(() => {}); // long polling cannot work while a webhook is set
    ready = true;
    console.log(`Telegram verification: ON (free) - bot @${botUsername}`);
    pollLoop();
  } catch (err) {
    console.error(`Telegram verification: OFF. ${err.message}`);
  }
}
