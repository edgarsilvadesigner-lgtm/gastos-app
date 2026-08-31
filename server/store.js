const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'expenses.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ nextId: 1, expenses: [] }, null, 2));
  }
}

function readData() {
  ensureFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse ${DATA_FILE}: ${err.message}`);
  }
}

function writeData(data) {
  ensureFile();
  const tmpFile = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  fs.renameSync(tmpFile, DATA_FILE);
}

function listExpenses({ user, from, to } = {}) {
  const data = readData();
  return data.expenses.filter((e) => {
    if (user && e.user !== user) return false;
    if (from && e.date < from) return false;
    if (to && e.date > to) return false;
    return true;
  }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
}

function addExpense({ user, category, amount, date, note }) {
  const data = readData();
  const expense = {
    id: data.nextId,
    user,
    category,
    amount,
    date,
    note: note || '',
    createdAt: new Date().toISOString(),
  };
  data.expenses.push(expense);
  data.nextId += 1;
  writeData(data);
  return expense;
}

function updateExpense(id, fields) {
  const data = readData();
  const idx = data.expenses.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  data.expenses[idx] = { ...data.expenses[idx], ...fields, id };
  writeData(data);
  return data.expenses[idx];
}

function deleteExpense(id) {
  const data = readData();
  const idx = data.expenses.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  data.expenses.splice(idx, 1);
  writeData(data);
  return true;
}

module.exports = { listExpenses, addExpense, updateExpense, deleteExpense };
