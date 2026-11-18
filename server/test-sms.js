// Sends one real test SMS so you can check your SMS settings in seconds:
//   npm run test:sms 9876543210
import './env.js';
import crypto from 'node:crypto';
import { deliver, parseContact, smsAvailable } from './otp.js';

const contact = parseContact(process.argv[2]);
if (!contact) {
  console.error('Usage: npm run test:sms <10-digit mobile number>');
  process.exit(1);
}
if (!smsAvailable()) {
  console.error('No SMS provider configured. Put FAST2SMS_API_KEY=your-key in the .env file (copy .env.example to .env).');
  process.exit(1);
}
const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
try {
  await deliver(contact.value, code);
  console.log(`Sent! A test message should reach ${contact.value} in a few seconds. Check the phone.`);
} catch (err) {
  console.error('SMS failed:', err.message);
  process.exit(1);
}
