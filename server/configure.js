// Guided setup for phone verification:   npm run configure
// Asks for your SMS / WhatsApp keys, saves them in the ".env" file, and sends a test message to your phone.
import './env.js';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { deliver, otpChannels, parseContact } from './otp.js';
import { checkBotToken } from './telegram.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const envPath = process.env.ENV_FILE || path.join(root, '.env');

// Line queue so this works when typing in a terminal and when input is piped in.
const rl = readline.createInterface({ input: process.stdin });
const lines = [];
const waiters = [];
let closed = false;
rl.on('line', (l) => (waiters.length ? waiters.shift()(l) : lines.push(l)));
rl.on('close', () => { closed = true; waiters.splice(0).forEach((w) => w('')); });
const ask = (q) =>
  new Promise((resolve) => {
    process.stdout.write(q);
    const done = (l) => { if (!process.stdin.isTTY) process.stdout.write(l + '\n'); resolve(l.trim()); };
    if (lines.length) done(lines.shift());
    else if (closed) done('');
    else waiters.push(done);
  });

function saveEnv(updates) {
  let text = '';
  if (fs.existsSync(envPath)) text = fs.readFileSync(envPath, 'utf8');
  else if (fs.existsSync(path.join(root, '.env.example'))) text = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=.*$`, 'm');
    text = re.test(text) ? text.replace(re, () => `${key}=${value}`) : text + (text.endsWith('\n') || !text ? '' : '\n') + `${key}=${value}\n`;
    process.env[key] = value;
  }
  fs.writeFileSync(envPath, text);
}

const keep = (name) => (process.env[name] ? ` (already set, press Enter to keep it)` : '');

console.log('\n=== Phone verification setup ===\n');
console.log('Reporters must confirm their mobile number before they can report a problem.');
console.log('Telegram is FREE for unlimited students. SMS and WhatsApp cost money.\n');
const yes = async (q, def) => {
  const a = (await ask(`${q} [${def ? 'Y/n' : 'y/N'}]: `)).toLowerCase();
  return a ? a.startsWith('y') : def;
};
const wantTg = await yes('Use Telegram (free)?', true);
const wantSms = await yes('Also use SMS (Fast2SMS, paid)?', false);
const wantWa = await yes('Also use WhatsApp (Meta)?', false);
const updates = {};

if (wantTg) {
  console.log('\n--- Telegram (free) ---');
  console.log('1. Open Telegram and chat with @BotFather   2. Send /newbot   3. Pick a name and a username ending in "bot"');
  console.log('4. BotFather replies with a token like 123456789:ABC...  Copy it.');
  const token = await ask(`Paste the bot token${keep('TELEGRAM_BOT_TOKEN')}: `);
  if (token && /\s/.test(token)) console.log('That token has spaces in it, so it was ignored. Copy only the token itself.');
  else if (token) {
    try {
      const username = await checkBotToken(token);
      updates.TELEGRAM_BOT_TOKEN = token;
      console.log(`  Token works. Your bot is @${username}`);
    } catch (err) {
      console.log(`  Telegram did not accept that token (${err.message}). It was not saved.`);
    }
  }
}
if (wantSms) {
  console.log('\n--- SMS ---');
  console.log('Get your key: fast2sms.com -> log in -> Dev API -> copy the API key. (Add money to the wallet.)');
  const key = await ask(`Paste your Fast2SMS API key${keep('FAST2SMS_API_KEY')}: `);
  if (key && /\s/.test(key)) console.log('That key has spaces in it, so it was ignored. Copy only the key itself.');
  else if (key) updates.FAST2SMS_API_KEY = key;
}
if (wantWa) {
  console.log('\n--- WhatsApp ---');
  console.log('From developers.facebook.com -> your app -> WhatsApp -> API Setup (see the README for the steps).');
  const token = await ask(`Access token${keep('WHATSAPP_TOKEN')}: `);
  const phoneId = await ask(`Phone number ID${keep('WHATSAPP_PHONE_ID')}: `);
  const template = await ask(`Approved Authentication template name${keep('WHATSAPP_TEMPLATE')} [campus_otp]: `);
  const lang = await ask('Template language exactly as in WhatsApp Manager [en_US]: ');
  if (token && !/\s/.test(token)) updates.WHATSAPP_TOKEN = token;
  if (phoneId && /^\d+$/.test(phoneId)) updates.WHATSAPP_PHONE_ID = phoneId;
  else if (phoneId) console.log('The Phone number ID should be digits only, so it was ignored.');
  if (template || !process.env.WHATSAPP_TEMPLATE) updates.WHATSAPP_TEMPLATE = template || 'campus_otp';
  if (lang || !process.env.WHATSAPP_TEMPLATE_LANG) updates.WHATSAPP_TEMPLATE_LANG = lang || 'en_US';
}

if (Object.keys(updates).length) {
  saveEnv(updates);
  console.log(`\nSaved to ${envPath}`);
}

const channels = otpChannels();
const tgOn = Boolean(process.env.TELEGRAM_BOT_TOKEN);
if (!channels.sms && !channels.whatsapp) {
  if (tgOn) {
    console.log('\nDone. Now run:  npm start     (look for "Telegram verification: ON (free)")\n');
    process.exit(0);
  }
  console.log('\nNothing is set up yet, so reporters still cannot verify. Run "npm run configure" again when you have your key.');
  process.exit(0);
}

const number = parseContact(await ask('\nYour own mobile number, to send a test message now (10 digits, or Enter to skip): '));
let failed = false;
if (number) {
  for (const channel of ['sms', 'whatsapp']) {
    if (!channels[channel]) continue;
    try {
      await deliver(number.value, String(100000 + Math.floor(Math.random() * 900000)), channel);
      console.log(`  ${channel === 'sms' ? 'SMS' : 'WhatsApp'}: sent. Check your phone in a few seconds.`);
    } catch (err) {
      failed = true;
      console.log(`  ${channel === 'sms' ? 'SMS' : 'WhatsApp'}: FAILED. ${err.message}`);
    }
  }
}
console.log(
  failed
    ? '\nThe settings are saved, but the test failed. Copy the FAILED line above and send it to me, or check the key.\n'
    : '\nDone. Now run:  npm start     (look for "SMS codes: ON" or "WhatsApp codes: ON")\n'
);
process.exit(failed ? 1 : 0);
