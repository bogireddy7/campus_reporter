import './env.js'; // must stay first: loads the .env file before anything reads settings
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { parseContact } from './phone.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
if (!process.env.JWT_SECRET) {
  if (IS_PROD) {
    console.error('JWT_SECRET must be set when NODE_ENV=production. Exiting.');
    process.exit(1);
  }
  console.warn('WARNING: JWT_SECRET not set, using an insecure development default.');
}

const CATEGORIES = [
  'Infrastructure',
  'Electrical',
  'Water & Sanitation',
  'Classroom / Lab',
  'Cleanliness',
  'Safety & Security',
  'Library',
  'Hostel / Canteen',
  'Transport',
  'Other',
];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const STATUSES = ['pending', 'in_progress', 'resolved', 'rejected'];

// ---------- uploads ----------
const uploadDir = path.resolve(process.env.DATA_DIR || 'data', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) =>
      cb(null, crypto.randomBytes(12).toString('hex') + (EXT[file.mimetype] || '.jpg')),
  }),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    EXT[file.mimetype] ? cb(null, true) : cb(new Error('Only JPG, PNG or WebP images are allowed')),
});

// ---------- staff access code ----------
// Staff (HOD / Admin Office) create their own account on the register page, but only with this code.
// Set STAFF_CODE in the environment, or one is generated once and kept in data/staff-code.txt.
const codeFile = path.resolve(process.env.DATA_DIR || 'data', 'staff-code.txt');
let STAFF_CODE = (process.env.STAFF_CODE || '').trim();
if (!STAFF_CODE) {
  if (fs.existsSync(codeFile)) STAFF_CODE = fs.readFileSync(codeFile, 'utf8').trim();
  else {
    STAFF_CODE = crypto.randomBytes(4).toString('hex').toUpperCase();
    fs.writeFileSync(codeFile, STAFF_CODE + '\n');
  }
}

// ---------- helpers ----------
const app = express();
app.set('trust proxy', 1); // behind the host's HTTPS proxy, so rate limits see the real visitor IP
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadDir, { maxAge: '7d' }));

function trackingId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 10; attempt++) {
    let id = 'CR-';
    for (let i = 0; i < 6; i++) id += alphabet[crypto.randomInt(alphabet.length)];
    if (!db.prepare('SELECT 1 FROM issues WHERE tracking_id = ?').get(id)) return id;
  }
  throw new Error('Could not generate tracking id');
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!['hod', 'office'].includes(payload.role)) throw new Error('not staff'); // reporter tokens are not staff
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

// Anyone can report by giving their name, roll number and mobile number. A logged-in HOD / Admin Office
// person is recognised from their login instead, so they do not have to type anything.
function reporterFrom(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (['hod', 'office'].includes(payload.role)) {
      return { name: payload.name, roll_no: payload.role === 'hod' ? 'HOD' : 'Admin Office', contact: payload.email, contact_type: 'email', staff: true };
    }
  } catch { /* fall through to the form details */ }
  return null;
}

// Simple in-memory limiter (slows down password and code guessing). perPath: count each URL separately.
const attempts = new Map();
const makeLimit = (max, perPath = true) => (req, res, next) => {
  const key = req.ip + (perPath ? req.path : '|' + max);
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (recent.length >= max) {
    return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
  }
  recent.push(now);
  attempts.set(key, recent);
  next();
};
const authLimit = makeLimit(15);

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v) => {
  const n = Number(v);
  return v !== '' && v != null && Number.isFinite(n) ? n : null;
};

// ---------- public routes ----------
app.get('/healthz', (_req, res) => res.send('ok'));
app.get('/api/meta', (_req, res) =>
  res.json({ categories: CATEGORIES, priorities: PRIORITIES, statuses: STATUSES, maps_key: process.env.GOOGLE_MAPS_API_KEY || '' })
);

const submitLimit = makeLimit(20); // stops one device from flooding the dashboards

app.post('/api/issues', submitLimit, (req, res) => {
  upload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });

    let reporter = reporterFrom(req);
    if (!reporter) {
      const name = clean(req.body.reporter_name, 80);
      const rollNo = clean(req.body.reporter_roll, 40);
      const phone = parseContact(req.body.reporter_phone);
      if (!name || !rollNo || !phone) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: 'Please enter your name, roll number and a valid 10-digit mobile number' });
      }
      reporter = { name, roll_no: rollNo, contact: phone.value, contact_type: 'phone' };
    }
    const title = clean(req.body.title, 120);
    const description = clean(req.body.description, 2000);
    const category = CATEGORIES.includes(req.body.category) ? req.body.category : 'Other';
    const categoryOther = category === 'Other' ? clean(req.body.category_other, 60) : '';

    if (!title || !description) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Title and description are required' });
    }
    if (category === 'Other' && !categoryOther) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Please type what kind of problem this is' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Please attach a photo of the problem' });
    }

    let lat = num(req.body.lat);
    let lng = num(req.body.lng);
    if (lat !== null && (lat < -90 || lat > 90)) lat = null;
    if (lng !== null && (lng < -180 || lng > 180)) lng = null;
    if (lat === null || lng === null) lat = lng = null;

    const priority = PRIORITIES.includes(req.body.priority) ? req.body.priority : 'medium';
    const tid = trackingId();

    const result = db
      .prepare(
        `INSERT INTO issues
         (tracking_id, title, description, category, category_other, priority, location_text, lat, lng, photo,
          reporter_name, reporter_id, reporter_contact, reporter_contact_type, reporter_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        tid, title, description, category, categoryOther || null, priority,
        clean(req.body.location_text, 200) || null, lat, lng, req.file.filename,
        reporter.name, reporter.roll_no, reporter.contact, reporter.contact_type, reporter.staff ? 1 : 0
      );

    db.prepare('INSERT INTO updates (issue_id, author, status, note) VALUES (?, ?, ?, ?)').run(
      result.lastInsertRowid, 'System', 'pending', 'Complaint submitted'
    );

    res.status(201).json({ tracking_id: tid });
  });
});

// Reporter-safe view: no contact details.
app.get('/api/track/:tid', (req, res) => {
  const issue = db
    .prepare(
      `SELECT id, tracking_id, title, category, category_other, priority, status, location_text, created_at, updated_at
       FROM issues WHERE tracking_id = ?`
    )
    .get(clean(req.params.tid, 20).toUpperCase());
  if (!issue) return res.status(404).json({ error: 'No complaint found with that tracking ID' });
  const timeline = db
    .prepare('SELECT author, status, note, created_at FROM updates WHERE issue_id = ? ORDER BY id')
    .all(issue.id);
  delete issue.id;
  res.json({ ...issue, timeline });
});

// ---------- auth ----------
const sessionFor = (user) => {
  const payload = { id: user.id, name: user.name, role: user.role, email: user.email };
  return { token: jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' }), user: payload };
};

app.post('/api/auth/register', authLimit, (req, res) => {
  const name = clean(req.body.name, 80);
  const email = clean(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || '');
  const role = req.body.role;
  const code = String(req.body.code || '').trim().toUpperCase();

  const given = Buffer.from(code);
  const expected = Buffer.from(STAFF_CODE.toUpperCase());
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return res.status(403).json({ error: 'Invalid staff access code' });
  }
  if (!name) return res.status(400).json({ error: 'Please enter your name' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email' });
  if (!['hod', 'office'].includes(role)) return res.status(400).json({ error: 'Choose HOD or Admin Office' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });
  }

  const result = db
    .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name, email, bcrypt.hashSync(password, 10), role);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(sessionFor(user));
});

app.post('/api/auth/login', authLimit, (req, res) => {
  const email = clean(req.body.email, 120).toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(String(req.body.password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.json(sessionFor(user));
});

app.get('/api/auth/me', auth, (req, res) => res.json({ user: req.user }));

// ---------- admin routes (HOD + Office) ----------
const PRIORITY_ORDER = `CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`;

app.get('/api/admin/issues', auth, (req, res) => {
  const where = [];
  const params = [];
  if (STATUSES.includes(req.query.status)) { where.push('status = ?'); params.push(req.query.status); }
  if (CATEGORIES.includes(req.query.category)) { where.push('category = ?'); params.push(req.query.category); }
  if (PRIORITIES.includes(req.query.priority)) { where.push('priority = ?'); params.push(req.query.priority); }
  const q = clean(req.query.q, 80);
  if (q) {
    where.push('(title LIKE ? OR description LIKE ? OR tracking_id LIKE ? OR reporter_name LIKE ? OR location_text LIKE ? OR category_other LIKE ? OR reporter_id LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like, like, like, like);
  }
  const sql = `SELECT * FROM issues ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY (status IN ('resolved','rejected')) ASC, ${PRIORITY_ORDER} ASC, created_at DESC LIMIT 500`;
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/admin/issues/:id', auth, (req, res) => {
  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(Number(req.params.id));
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  issue.timeline = db
    .prepare('SELECT author, status, note, created_at FROM updates WHERE issue_id = ? ORDER BY id')
    .all(issue.id);
  res.json(issue);
});

app.patch('/api/admin/issues/:id', auth, (req, res) => {
  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(Number(req.params.id));
  if (!issue) return res.status(404).json({ error: 'Issue not found' });

  const status = STATUSES.includes(req.body.status) ? req.body.status : issue.status;
  const priority = PRIORITIES.includes(req.body.priority) ? req.body.priority : issue.priority;
  const note = clean(req.body.note, 500);

  const changed = status !== issue.status || priority !== issue.priority || note;
  if (!changed) return res.status(400).json({ error: 'Nothing to update' });

  db.prepare("UPDATE issues SET status = ?, priority = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, priority, issue.id);

  const parts = [];
  if (priority !== issue.priority) parts.push(`Priority set to ${priority}`);
  if (note) parts.push(note);
  db.prepare('INSERT INTO updates (issue_id, user_id, author, status, note) VALUES (?, ?, ?, ?, ?)')
    .run(issue.id, req.user.id, req.user.name, status, parts.join(' · ') || null);

  res.json({ ok: true });
});

// Permanently deletes a report (its photo and history too). Either staff account may do this.
app.delete('/api/admin/issues/:id', auth, (req, res) => {
  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(Number(req.params.id));
  if (!issue) return res.status(404).json({ error: 'Report not found (it may already be deleted)' });
  db.prepare('INSERT INTO deletions (tracking_id, title, deleted_by) VALUES (?, ?, ?)')
    .run(issue.tracking_id, issue.title, `${req.user.name} (${req.user.role === 'hod' ? 'HOD' : 'Admin Office'})`);
  db.prepare('DELETE FROM issues WHERE id = ?').run(issue.id); // its history rows are removed with it
  if (issue.photo) fs.unlink(path.join(uploadDir, path.basename(issue.photo)), () => {});
  res.json({ ok: true });
});

app.get('/api/admin/stats', auth, (_req, res) => {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const r of db.prepare('SELECT status, COUNT(*) AS c FROM issues GROUP BY status').all()) byStatus[r.status] = r.c;
  const urgentOpen = db
    .prepare("SELECT COUNT(*) AS c FROM issues WHERE priority IN ('urgent','high') AND status IN ('pending','in_progress')")
    .get().c;
  const byCategory = db
    .prepare('SELECT category, COUNT(*) AS c FROM issues GROUP BY category ORDER BY c DESC')
    .all();
  res.json({ total: Object.values(byStatus).reduce((a, b) => a + b, 0), byStatus, urgentOpen, byCategory });
});

// ---------- serve built frontend ----------
const dist = path.resolve(__dirname, '../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|uploads).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

app.listen(PORT, () => {
  console.log(`Campus Reporter running on http://localhost:${PORT}`);
  console.log(`Staff registration code: ${STAFF_CODE}  (give it only to the HOD and Admin Office)`);
  if (!process.env.GOOGLE_MAPS_API_KEY) console.log('Google Maps: no GOOGLE_MAPS_API_KEY, the dashboard map shows a list with Navigate links instead.');
});
