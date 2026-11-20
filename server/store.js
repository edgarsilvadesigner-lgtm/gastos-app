const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || 'gastos';

let dbPromise = null;

function getDb() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI não está definida. Configura essa variável de ambiente com a ligação à base de dados.');
  }
  if (!dbPromise) {
    const client = new MongoClient(MONGODB_URI);
    dbPromise = client.connect().then((c) => c.db(DB_NAME));
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

function stripMongoId(doc) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return rest;
}

async function nextSequence(name) {
  const db = await getDb();
  await db.collection('counters').updateOne({ _id: name }, { $inc: { seq: 1 } }, { upsert: true });
  const doc = await db.collection('counters').findOne({ _id: name });
  return doc.seq;
}

async function listExpenses({ user, from, to, type } = {}) {
  const db = await getDb();
  const query = {};
  if (user) query.user = user;
  if (type) query.type = type;
  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = from;
    if (to) query.date.$lte = to;
  }
  const docs = await db.collection('expenses').find(query).sort({ date: -1, id: -1 }).toArray();
  return docs.map(stripMongoId);
}

async function addExpense({ user, category, amount, date, note, type, included }) {
  const db = await getDb();
  const id = await nextSequence('expenses');
  const expense = {
    id,
    user,
    category,
    amount,
    date,
    note: note || '',
    type: type || 'expense',
    included: included !== false,
    createdAt: new Date().toISOString(),
  };
  await db.collection('expenses').insertOne(expense);
  return stripMongoId(expense);
}

async function updateExpense(id, fields) {
  const db = await getDb();
  const result = await db.collection('expenses').updateOne({ id }, { $set: fields });
  if (result.matchedCount === 0) return null;
  const doc = await db.collection('expenses').findOne({ id });
  return stripMongoId(doc);
}

async function deleteExpense(id) {
  const db = await getDb();
  const result = await db.collection('expenses').deleteOne({ id });
  return result.deletedCount > 0;
}

async function listCustomCategories(type) {
  const db = await getDb();
  const docs = await db.collection('categories').find({ type }).toArray();
  return docs.map(stripMongoId);
}

async function addCustomCategory({ type, label, color }) {
  const db = await getDb();
  const seq = await nextSequence('categories');
  const category = { id: `custom_${seq}`, type, label, color, custom: true };
  await db.collection('categories').insertOne(category);
  return stripMongoId(category);
}

module.exports = {
  listExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
  listCustomCategories,
  addCustomCategory,
};
