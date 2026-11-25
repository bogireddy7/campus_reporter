/** Accepts Indian mobile numbers (10 digits starting 6-9, optional +91 / 91). Returns { type: 'phone', value: '+91XXXXXXXXXX' } or null. */
export function parseContact(raw) {
  const digits = String(raw || '').replace(/[\s\-()]/g, '');
  if (/^(\+?91)?[6-9]\d{9}$/.test(digits)) return { type: 'phone', value: '+91' + digits.slice(-10) };
  return null;
}
