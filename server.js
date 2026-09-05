// server.js — BERRY дэлгүүрийн backend
// Захиалга хадгалах + бүтээгдэхүүн/тохиргоог админ хуудаснаас удирдах боломжтой

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'berry2026'; // ⚠️ Байршуулахдаа энэ түлхүүрийг заавал солиорой!

const DATA_DIR = path.join(__dirname, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const IMAGES_DIR = path.join(__dirname, 'public', 'images');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]', 'utf-8');
if (!fs.existsSync(PRODUCTS_FILE)) fs.writeFileSync(PRODUCTS_FILE, '[]', 'utf-8');
if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify({
  bankName: "", bankAccount: "", bankHolder: "", storeName: "BERRY", categories: []
}, null, 2), 'utf-8');

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch (e) { return null; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}
function checkKey(req, res) {
  if (req.query.key !== ADMIN_KEY && (req.body && req.body.key) !== ADMIN_KEY) {
    res.status(401).json({ ok: false, error: 'Админ түлхүүр буруу байна.' });
    return false;
  }
  return true;
}

app.use(express.json({ limit: '15mb' })); // зурган upload-д зориулж хэмжээг нэмэгдүүлсэн
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- ЗАХИАЛГА ---------- */

app.post('/api/orders', (req, res) => {
  const { name, phone, items, total } = req.body;
  if (!name || !phone || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, error: 'Мэдээлэл дутуу байна.' });
  }
  const orders = readJSON(ORDERS_FILE) || [];
  const newOrder = {
    id: Date.now(),
    name: String(name).slice(0, 200),
    phone: String(phone).slice(0, 50),
    items, total: Number(total) || 0,
    status: 'Шинэ',
    createdAt: new Date().toISOString()
  };
  orders.unshift(newOrder);
  writeJSON(ORDERS_FILE, orders);
  console.log(`Шинэ захиалга: ${newOrder.name} (${newOrder.phone}) — ${newOrder.total}₮`);
  res.json({ ok: true, orderId: newOrder.id });
});

app.get('/api/orders', (req, res) => {
  if (!checkKey(req, res)) return;
  res.json({ ok: true, orders: readJSON(ORDERS_FILE) || [] });
});

app.post('/api/orders/:id/status', (req, res) => {
  if (!checkKey(req, res)) return;
  const orders = readJSON(ORDERS_FILE) || [];
  const order = orders.find(o => String(o.id) === req.params.id);
  if (!order) return res.status(404).json({ ok: false, error: 'Захиалга олдсонгүй.' });
  order.status = req.body.status || order.status;
  writeJSON(ORDERS_FILE, orders);
  res.json({ ok: true });
});

/* ---------- БҮТЭЭГДЭХҮҮН ---------- */

app.get('/api/products', (req, res) => {
  res.json({ ok: true, products: readJSON(PRODUCTS_FILE) || [] });
});

app.post('/api/products', (req, res) => {
  if (!checkKey(req, res)) return;
  const products = readJSON(PRODUCTS_FILE) || [];
  const p = req.body.product;
  if (!p || !p.name || !p.cat || !p.price) {
    return res.status(400).json({ ok: false, error: 'Бүтээгдэхүүний мэдээлэл дутуу байна.' });
  }
  if (p.id) {
    const idx = products.findIndex(x => x.id === p.id);
    if (idx === -1) return res.status(404).json({ ok: false, error: 'Бүтээгдэхүүн олдсонгүй.' });
    products[idx] = p;
  } else {
    p.id = Date.now();
    products.push(p);
  }
  writeJSON(PRODUCTS_FILE, products);
  res.json({ ok: true, product: p });
});

app.delete('/api/products/:id', (req, res) => {
  if (!checkKey(req, res)) return;
  let products = readJSON(PRODUCTS_FILE) || [];
  const before = products.length;
  products = products.filter(p => String(p.id) !== req.params.id);
  if (products.length === before) return res.status(404).json({ ok: false, error: 'Бүтээгдэхүүн олдсонгүй.' });
  writeJSON(PRODUCTS_FILE, products);
  res.json({ ok: true });
});

app.post('/api/upload', (req, res) => {
  if (!checkKey(req, res)) return;
  const { filename, dataUrl } = req.body;
  if (!filename || !dataUrl || !dataUrl.startsWith('data:image/')) {
    return res.status(400).json({ ok: false, error: 'Зургийн өгөгдөл буруу байна.' });
  }
  const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) return res.status(400).json({ ok: false, error: 'Зургийн формат танигдсангүй.' });
  const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  const safeName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9.\-]/g, '_')}`.replace(/\.\w+$/, '') + '.' + ext;
  fs.writeFileSync(path.join(IMAGES_DIR, safeName), buffer);
  res.json({ ok: true, path: `images/${safeName}` });
});

/* ---------- ТОХИРГОО (банкны данс гэх мэт) ---------- */

app.get('/api/settings', (req, res) => {
  res.json({ ok: true, settings: readJSON(SETTINGS_FILE) || {} });
});

app.post('/api/settings', (req, res) => {
  if (!checkKey(req, res)) return;
  const current = readJSON(SETTINGS_FILE) || {};
  const updated = { ...current, ...req.body.settings };
  writeJSON(SETTINGS_FILE, updated);
  res.json({ ok: true, settings: updated });
});

app.listen(PORT, () => {
  console.log(`BERRY backend ажиллаж байна: http://localhost:${PORT}`);
});
