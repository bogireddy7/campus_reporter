// Sends one real test SMS so you can check your SMS settings in seconds:
//   npm run test:sms 9876543210            (SMS)
//   npm run test:sms 9876543210 whatsapp   (WhatsApp)
import './env.js';
import crypto from 'node:crypto';
import { deliver, otpChannels, parseContact } from './otp.js';

const contact = parseContact(process.argv[2]);
if (!contact) {
  console.error('Usage: npm run test:sms <10-digit mobile number> [whatsapp]');
  process.exit(1);
}
const channel = process.argv[3] === 'whatsapp' ? 'whatsapp' : 'sms';
if (!otpChannels()[channel]) {
  console.error(
    channel === 'whatsapp'
      ? 'WhatsApp is not configured. Fill in WHATSAPP_TOKEN, WHATSAPP_PHONE_ID and WHATSAPP_TEMPLATE in the .env file.'
      : 'No SMS provider configured. Put FAST2SMS_API_KEY=your-key in the .env file (copy .env.example to .env).'
  );
  process.exit(1);
}
const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
try {
  await deliver(contact.value, code, channel);
  console.log(`Sent! A test message should reach ${contact.value} in a few seconds. Check the phone.`);
} catch (err) {
  console.error('Sending failed:', err.message);
  process.exit(1);
}
