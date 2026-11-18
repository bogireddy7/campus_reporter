const TOKEN_KEY = 'cr_token';
const USER_KEY = 'cr_user';

export const session = {
  get token() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  get user() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
  },
  save(token, user) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch { /* storage unavailable */ }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch { /* storage unavailable */ }
  },
};

// A reporter proves their email / phone with an OTP and gets a short-lived token (kept per browser tab).
const REPORTER_KEY = 'cr_reporter';
export const reporterSession = {
  get() {
    try {
      const data = JSON.parse(sessionStorage.getItem(REPORTER_KEY) || 'null');
      if (!data) return null;
      const exp = JSON.parse(atob(data.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000;
      if (Date.now() > exp) { sessionStorage.removeItem(REPORTER_KEY); return null; }
      return data; // { token, reporter }
    } catch { return null; }
  },
  save(data) { try { sessionStorage.setItem(REPORTER_KEY, JSON.stringify(data)); } catch { /* storage unavailable */ } },
  clear() { try { sessionStorage.removeItem(REPORTER_KEY); } catch { /* storage unavailable */ } },
};

async function request(path, { method = 'GET', body, form, token } = {}) {
  const headers = {};
  const bearer = token ?? session.token;
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  let payload;
  if (form) payload = form;
  else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(path, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      if (bearer && bearer === session.token) {
        session.clear(); // a staff session ended
        window.dispatchEvent(new Event('cr-logout'));
      } else if (token) {
        reporterSession.clear(); // a reporter's OTP verification ended
        window.dispatchEvent(new Event('cr-reporter-expired'));
      }
    }
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export const api = {
  meta: () => request('/api/meta'),
  requestOtp: (body) => request('/api/otp/request', { method: 'POST', body, token: '' }),
  verifyOtp: (body) => request('/api/otp/verify', { method: 'POST', body, token: '' }),
  submitIssue: (form, token) => request('/api/issues', { method: 'POST', form, token }),
  track: (tid) => request(`/api/track/${encodeURIComponent(tid)}`),
  register: (body) => request('/api/auth/register', { method: 'POST', body }),
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
  issues: (params) => request('/api/admin/issues?' + new URLSearchParams(params)),
  issue: (id) => request(`/api/admin/issues/${id}`),
  deleteIssue: (id) => request(`/api/admin/issues/${id}`, { method: 'DELETE' }),
  updateIssue: (id, body) => request(`/api/admin/issues/${id}`, { method: 'PATCH', body }),
  stats: () => request('/api/admin/stats'),
};

export const STATUS_LABEL = {
  pending: 'Pending',
  in_progress: 'In progress',
  resolved: 'Resolved',
  rejected: 'Rejected',
};

export function formatDate(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const catLabel = (issue) =>
  issue.category === 'Other' && issue.category_other ? `Other: ${issue.category_other}` : issue.category;

// Google Maps: show the spot, or start turn-by-turn navigation to it (opens the Google Maps app on phones).
export function mapLink(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
export function navLink(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}
