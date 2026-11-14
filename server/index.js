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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
if (!process.env.JWT_SECRET) {
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
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

// Simple in-memory limiter for login / register (slows down password and code guessing).
const attempts = new Map();
function authLimit(req, res, next) {
  const key = req.ip + req.path;
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (recent.length >= 15) {
    return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });
  }
  recent.push(now);
  attempts.set(key, recent);
  next();
}

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v) => {
  const n = Number(v);
  return v !== '' && v != null && Number.isFinite(n) ? n : null;
};

// ---------- public routes ----------
app.get('/api/meta', (_req, res) => res.json({ categories: CATEGORIES, priorities: PRIORITIES, statuses: STATUSES }));

app.post('/api/issues', (req, res) => {
  upload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const title = clean(req.body.title, 120);
    const description = clean(req.body.description, 2000);
    const category = CATEGORIES.includes(req.body.category) ? req.body.category : 'Other';
    const reporterName = clean(req.body.reporter_name, 80);

    if (!title || !description || !reporterName) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Title, description and your name are required' });
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
         (tracking_id, title, description, category, priority, location_text, lat, lng, photo,
          reporter_name, reporter_id, reporter_contact)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        tid, title, description, category, priority,
        clean(req.body.location_text, 200) || null, lat, lng, req.file.filename,
        reporterName, clean(req.body.reporter_id, 40) || null, clean(req.body.reporter_contact, 80) || null
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
      `SELECT id, tracking_id, title, category, priority, status, location_text, created_at, updated_at
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
    where.push('(title LIKE ? OR description LIKE ? OR tracking_id LIKE ? OR reporter_name LIKE ? OR location_text LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
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
});
