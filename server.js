// server.js — BERRY дэлгүүрийн захиалга хадгалах жирийн backend
// Захиалга ирэхэд data/orders.json файлд хадгалж, /admin хуудаснаас харах боломжтой.

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'berry2026'; // ⚠️ Байршуулахдаа энэ түлхүүрийг заавал солиорой!

const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');

// data/ folder болон orders.json файл байхгүй бол үүсгэнэ
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}
if (!fs.existsSync(ORDERS_FILE)) {
  fs.writeFileSync(ORDERS_FILE, '[]', 'utf-8');
}

function readOrders() {
  try {
    return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function writeOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf-8');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Захиалга хадгалах
app.post('/api/orders', (req, res) => {
  const { name, phone, items, total } = req.body;

  if (!name || !phone || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, error: 'Мэдээлэл дутуу байна.' });
  }

  const orders = readOrders();
  const newOrder = {
    id: Date.now(),
    name: String(name).slice(0, 200),
    phone: String(phone).slice(0, 50),
    items,
    total: Number(total) || 0,
    status: 'Шинэ',
    createdAt: new Date().toISOString()
  };
  orders.unshift(newOrder); // хамгийн шинийг эхэнд нь
  writeOrders(orders);

  console.log(`Шинэ захиалга: ${newOrder.name} (${newOrder.phone}) — ${newOrder.total}₮`);
  res.json({ ok: true, orderId: newOrder.id });
});

// Захиалгуудыг харах (админ түлхүүр шаардана)
app.get('/api/orders', (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: 'Админ түлхүүр буруу байна.' });
  }
  res.json({ ok: true, orders: readOrders() });
});

// Захиалгын статус солих (жишээ нь "Шинэ" -> "Баталгаажсан")
app.post('/api/orders/:id/status', (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(401).json({ ok: false, error: 'Админ түлхүүр буруу байна.' });
  }
  const orders = readOrders();
  const order = orders.find(o => String(o.id) === req.params.id);
  if (!order) return res.status(404).json({ ok: false, error: 'Захиалга олдсонгүй.' });
  order.status = req.body.status || order.status;
  writeOrders(orders);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`BERRY backend ажиллаж байна: http://localhost:${PORT}`);
});
