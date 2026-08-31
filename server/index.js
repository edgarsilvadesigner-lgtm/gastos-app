const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const { CATEGORIES, CATEGORY_IDS } = require('./categories');
const store = require('./store');

const APP_PASSWORD = process.env.APP_PASSWORD || 'garlia';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const PORT = process.env.PORT || 3000;
const USERS = new Set(['edgar', 'nelia']);
const COOKIE_NAME = 'gastos_session';
const SESSION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

const app = express();
app.use(express.json());
app.use(cookieParser());

function sign(value) {
  const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
  return `${value}.${hmac}`;
}

function verify(signed) {
  if (!signed) return false;
  const idx = signed.lastIndexOf('.');
  if (idx === -1) return false;
  const value = signed.slice(0, idx);
  const expected = sign(value);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signed)) ? value : false;
}

function requireAuth(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (verify(token) === 'ok') return next();
  return res.status(401).json({ error: 'not_authenticated' });
}

app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== 'string' || password !== APP_PASSWORD) {
    return res.status(401).json({ error: 'invalid_password' });
  }
  res.cookie(COOKIE_NAME, sign('ok'), {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_MS,
  });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  const token = req.cookies[COOKIE_NAME];
  res.json({ authenticated: verify(token) === 'ok' });
});

app.get('/api/categories', requireAuth, (req, res) => {
  res.json(CATEGORIES);
});

app.get('/api/expenses', requireAuth, (req, res) => {
  const { user, from, to } = req.query;
  if (user && !USERS.has(user)) return res.status(400).json({ error: 'invalid_user' });
  res.json(store.listExpenses({ user, from, to }));
});

app.post('/api/expenses', requireAuth, (req, res) => {
  const { user, category, amount, date, note } = req.body || {};
  if (!USERS.has(user)) return res.status(400).json({ error: 'invalid_user' });
  if (!CATEGORY_IDS.has(category)) return res.status(400).json({ error: 'invalid_category' });
  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) return res.status(400).json({ error: 'invalid_amount' });
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'invalid_date' });
  const expense = store.addExpense({ user, category, amount: numAmount, date, note: typeof note === 'string' ? note.slice(0, 500) : '' });
  res.status(201).json(expense);
});

app.put('/api/expenses/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { user, category, amount, date, note } = req.body || {};
  const fields = {};
  if (user !== undefined) {
    if (!USERS.has(user)) return res.status(400).json({ error: 'invalid_user' });
    fields.user = user;
  }
  if (category !== undefined) {
    if (!CATEGORY_IDS.has(category)) return res.status(400).json({ error: 'invalid_category' });
    fields.category = category;
  }
  if (amount !== undefined) {
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) return res.status(400).json({ error: 'invalid_amount' });
    fields.amount = numAmount;
  }
  if (date !== undefined) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'invalid_date' });
    fields.date = date;
  }
  if (note !== undefined) fields.note = typeof note === 'string' ? note.slice(0, 500) : '';
  const updated = store.updateExpense(id, fields);
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json(updated);
});

app.delete('/api/expenses/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const ok = store.deleteExpense(id);
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Gastos app listening on port ${PORT}`);
});
