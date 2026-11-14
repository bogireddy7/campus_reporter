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

async function request(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  let payload;
  if (form) payload = form;
  else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(path, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && session.token) {
      session.clear();
      window.dispatchEvent(new Event('cr-logout'));
    }
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

export const api = {
  meta: () => request('/api/meta'),
  submitIssue: (form) => request('/api/issues', { method: 'POST', form }),
  track: (tid) => request(`/api/track/${encodeURIComponent(tid)}`),
  register: (body) => request('/api/auth/register', { method: 'POST', body }),
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
  issues: (params) => request('/api/admin/issues?' + new URLSearchParams(params)),
  issue: (id) => request(`/api/admin/issues/${id}`),
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

export function mapLink(lat, lng) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
}
