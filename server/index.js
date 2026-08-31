try { require('dotenv').config(); } catch (e) { /* dotenv is optional in production */ }
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const ExcelJS = require('exceljs');
const { categoriesForType, categoryIdsForType } = require('./categories');
const store = require('./store');

const APP_PASSWORD = process.env.APP_PASSWORD || 'garlia';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const PORT = process.env.PORT || 3000;
const USERS = new Set(['edgar', 'nelia']);
const USER_LABELS = { edgar: 'Edgar', nelia: 'Nélia' };
const COOKIE_NAME = 'gastos_session';
const SESSION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

const app = express();
app.use(express.json());
app.use(cookieParser());

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

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

async function isValidCategory(type, categoryId) {
  if (categoryIdsForType(type).has(categoryId)) return true;
  const custom = await store.listCustomCategories(type);
  return custom.some((c) => c.id === categoryId);
}

async function categoryLookup(type) {
  const custom = await store.listCustomCategories(type);
  const map = {};
  for (const c of [...categoriesForType(type), ...custom]) map[c.id] = c.label;
  return map;
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

app.get('/api/categories', requireAuth, asyncHandler(async (req, res) => {
  const { type } = req.query;
  if (type && type !== 'expense' && type !== 'income') return res.status(400).json({ error: 'invalid_type' });
  const effectiveType = type || 'expense';
  const custom = await store.listCustomCategories(effectiveType);
  res.json([...categoriesForType(effectiveType), ...custom]);
}));

app.post('/api/categories', requireAuth, asyncHandler(async (req, res) => {
  const { type, label, color } = req.body || {};
  if (type !== 'expense' && type !== 'income') return res.status(400).json({ error: 'invalid_type' });
  if (typeof label !== 'string' || !label.trim()) return res.status(400).json({ error: 'invalid_label' });
  const finalColor = typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#8e8e93';
  const category = await store.addCustomCategory({ type, label: label.trim().slice(0, 40), color: finalColor });
  res.status(201).json(category);
}));

app.get('/api/expenses', requireAuth, asyncHandler(async (req, res) => {
  const { user, from, to, type } = req.query;
  if (user && !USERS.has(user)) return res.status(400).json({ error: 'invalid_user' });
  if (type && type !== 'expense' && type !== 'income') return res.status(400).json({ error: 'invalid_type' });
  res.json(await store.listExpenses({ user, from, to, type }));
}));

app.post('/api/expenses', requireAuth, asyncHandler(async (req, res) => {
  const { user, category, amount, date, note, type } = req.body || {};
  if (!USERS.has(user)) return res.status(400).json({ error: 'invalid_user' });
  if (type !== undefined && type !== 'expense' && type !== 'income') return res.status(400).json({ error: 'invalid_type' });
  const effectiveType = type || 'expense';
  if (!(await isValidCategory(effectiveType, category))) return res.status(400).json({ error: 'invalid_category' });
  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) return res.status(400).json({ error: 'invalid_amount' });
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'invalid_date' });
  const expense = await store.addExpense({ user, category, amount: numAmount, date, note: typeof note === 'string' ? note.slice(0, 500) : '', type: effectiveType });
  res.status(201).json(expense);
}));

app.put('/api/expenses/:id', requireAuth, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { user, category, amount, date, note, type } = req.body || {};
  const fields = {};
  if (user !== undefined) {
    if (!USERS.has(user)) return res.status(400).json({ error: 'invalid_user' });
    fields.user = user;
  }
  if (type !== undefined) {
    if (type !== 'expense' && type !== 'income') return res.status(400).json({ error: 'invalid_type' });
    fields.type = type;
  }
  if (category !== undefined) {
    if (!(await isValidCategory(type || 'expense', category))) return res.status(400).json({ error: 'invalid_category' });
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
  const updated = await store.updateExpense(id, fields);
  if (!updated) return res.status(404).json({ error: 'not_found' });
  res.json(updated);
}));

app.delete('/api/expenses/:id', requireAuth, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const ok = await store.deleteExpense(id);
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
}));

app.get('/api/report.xlsx', requireAuth, asyncHandler(async (req, res) => {
  const { user, from, to } = req.query;
  if (user && !USERS.has(user)) return res.status(400).json({ error: 'invalid_user' });

  const [expenses, incomes, expenseCatMap, incomeCatMap] = await Promise.all([
    store.listExpenses({ user, from, to, type: 'expense' }),
    store.listExpenses({ user, from, to, type: 'income' }),
    categoryLookup('expense'),
    categoryLookup('income'),
  ]);

  const totalIncome = incomes.reduce((s, e) => s + e.amount, 0);
  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
  const balance = totalIncome - totalExpense;
  const currencyFmt = '#,##0.00 "€"';

  function groupByCategory(list, catMap) {
    const map = {};
    for (const e of list) {
      if (!map[e.category]) map[e.category] = 0;
      map[e.category] += e.amount;
    }
    return Object.entries(map)
      .map(([id, amount]) => ({ label: catMap[id] || id, amount }))
      .sort((a, b) => b.amount - a.amount);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Gastos — Edgar e Nélia';
  workbook.created = new Date();

  // ---- Resumo ----
  const summary = workbook.addWorksheet('Resumo');
  summary.columns = [{ width: 30 }, { width: 18 }];

  const titleRow = summary.addRow(['Relatório Financeiro']);
  titleRow.font = { bold: true, size: 16 };
  summary.addRow([`Período: ${from || 'início'} até ${to || 'hoje'}`]).font = { italic: true, color: { argb: 'FF666666' } };
  summary.addRow([`Utilizador: ${user ? USER_LABELS[user] : 'Edgar e Nélia (ambos)'}`]).font = { italic: true, color: { argb: 'FF666666' } };
  summary.addRow([]);

  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C1C1F' } };
  const sectionRow = summary.addRow(['Resumo', 'Valor']);
  sectionRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sectionRow.eachCell((cell) => { cell.fill = headerFill; });

  const incomeRow = summary.addRow(['Total de Rendimentos', totalIncome]);
  incomeRow.getCell(2).numFmt = currencyFmt;
  incomeRow.getCell(2).font = { color: { argb: 'FF1E7B34' } };

  const expenseRow = summary.addRow(['Total de Despesas', totalExpense]);
  expenseRow.getCell(2).numFmt = currencyFmt;
  expenseRow.getCell(2).font = { color: { argb: 'FFC0392B' } };

  const balanceRow = summary.addRow(['Saldo', balance]);
  balanceRow.getCell(2).numFmt = currencyFmt;
  balanceRow.font = { bold: true };
  balanceRow.getCell(2).font = { bold: true, color: { argb: balance >= 0 ? 'FF1E7B34' : 'FFC0392B' } };

  summary.addRow([]);

  const expHeaderRow = summary.addRow(['Despesas por categoria', '']);
  expHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  expHeaderRow.eachCell((cell) => { cell.fill = headerFill; });
  for (const row of groupByCategory(expenses, expenseCatMap)) {
    const r = summary.addRow([row.label, row.amount]);
    r.getCell(2).numFmt = currencyFmt;
  }

  summary.addRow([]);

  const incHeaderRow = summary.addRow(['Rendimentos por categoria', '']);
  incHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  incHeaderRow.eachCell((cell) => { cell.fill = headerFill; });
  for (const row of groupByCategory(incomes, incomeCatMap)) {
    const r = summary.addRow([row.label, row.amount]);
    r.getCell(2).numFmt = currencyFmt;
  }

  // ---- Transaction sheets ----
  function addTransactionSheet(name, list, catMap) {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = [
      { header: 'Data', key: 'date', width: 12 },
      { header: 'Utilizador', key: 'user', width: 12 },
      { header: 'Categoria', key: 'category', width: 24 },
      { header: 'Nota', key: 'note', width: 34 },
      { header: 'Valor', key: 'amount', width: 14 },
    ];
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.eachCell((cell) => { cell.fill = headerFill; });
    for (const e of list) {
      sheet.addRow({
        date: e.date,
        user: USER_LABELS[e.user] || e.user,
        category: catMap[e.category] || e.category,
        note: e.note || '',
        amount: e.amount,
      });
    }
    sheet.getColumn('amount').numFmt = currencyFmt;
    sheet.autoFilter = { from: 'A1', to: 'E1' };
  }

  addTransactionSheet('Despesas', expenses, expenseCatMap);
  addTransactionSheet('Rendimentos', incomes, incomeCatMap);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="relatorio-gastos.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
}));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'server_error' });
});

app.listen(PORT, () => {
  console.log(`Gastos app listening on port ${PORT}`);
});
