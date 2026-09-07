// server.js — BERRY дэлгүүрийн backend
// MONGODB_URI environment variable байвал MongoDB Atlas-д (найдвартай, мөнхийн) хадгална.
// Байхгүй бол хуучин шигээ локал JSON файлд хадгална (Render free tier дээр диск бэхжихгүй анхаарна уу).

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'berry2026'; // ⚠️ Байршуулахдаа энэ түлхүүрийг заавал солиорой!
const MONGODB_URI = process.env.MONGODB_URI || '';

const DATA_DIR = path.join(__dirname, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json'); // анхны (seed) бүтээгдэхүүн
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json'); // анхны (seed) тохиргоо

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
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

/* =====================================================================
   ӨГӨГДЛИЙН ДАВХАРГА (Data layer)
   MONGODB_URI байвал Mongo ашиглана, байхгүй бол JSON файл ашиглана.
   Аль ч тохиолдолд дээрх /api/* route-ууд ижил ажиллана.
===================================================================== */

let store; // энэ объект руу бид бодит хадгалалтын функцуудыг холбоно

async function initFileStore() {
  console.log('⚠️  MONGODB_URI олдсонгүй — локал JSON файлд хадгалж байна (Render free tier дээр диск бэхжихгүй байж болно).');
  store = {
    async getOrders() { return readJSON(ORDERS_FILE) || []; },
    async addOrder(order) {
      const orders = readJSON(ORDERS_FILE) || [];
      orders.unshift(order);
      writeJSON(ORDERS_FILE, orders);
    },
    async setOrderStatus(id, status) {
      const orders = readJSON(ORDERS_FILE) || [];
      const o = orders.find(o => String(o.id) === String(id));
      if (!o) return false;
      o.status = status;
      writeJSON(ORDERS_FILE, orders);
      return true;
    },
    async getProducts() { return readJSON(PRODUCTS_FILE) || []; },
    async saveProduct(p) {
      const products = readJSON(PRODUCTS_FILE) || [];
      if (p.id) {
        const idx = products.findIndex(x => x.id === p.id);
        if (idx === -1) return null;
        products[idx] = p;
      } else {
        p.id = Date.now();
        products.push(p);
      }
      writeJSON(PRODUCTS_FILE, products);
      return p;
    },
    async deleteProduct(id) {
      let products = readJSON(PRODUCTS_FILE) || [];
      const before = products.length;
      products = products.filter(p => String(p.id) !== String(id));
      writeJSON(PRODUCTS_FILE, products);
      return products.length !== before;
    },
    async getSettings() { return readJSON(SETTINGS_FILE) || {}; },
    async saveSettings(patch) {
      const current = readJSON(SETTINGS_FILE) || {};
      const updated = { ...current, ...patch };
      writeJSON(SETTINGS_FILE, updated);
      return updated;
    }
  };
}

async function initMongoStore() {
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db('berry_shop');
  const orders = db.collection('orders');
  const products = db.collection('products');
  const settings = db.collection('settings');

  // Анхны ажиллуулалт бол seed өгөгдлөөр дүүргэнэ
  if (await products.countDocuments() === 0) {
    const seed = readJSON(PRODUCTS_FILE) || [];
    if (seed.length) await products.insertMany(seed);
    console.log(`✅ MongoDB: ${seed.length} seed бүтээгдэхүүн ачааллаа.`);
  }
  if (await settings.findOne({ _id: 'main' }) === null) {
    const seed = readJSON(SETTINGS_FILE) || {};
    await settings.insertOne({ _id: 'main', ...seed });
    console.log('✅ MongoDB: seed тохиргоо ачааллаа.');
  }

  console.log('✅ MongoDB-тэй холбогдлоо — өгөгдөл мөнхөд хадгалагдана.');

  store = {
    async getOrders() {
      return await orders.find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
    },
    async addOrder(order) {
      await orders.insertOne(order);
    },
    async setOrderStatus(id, status) {
      const res = await orders.updateOne({ id: Number(id) }, { $set: { status } });
      return res.matchedCount > 0;
    },
    async getProducts() {
      return await products.find({}, { projection: { _id: 0 } }).toArray();
    },
    async saveProduct(p) {
      if (p.id) {
        const res = await products.replaceOne({ id: p.id }, p);
        if (res.matchedCount === 0) return null;
        return p;
      } else {
        p.id = Date.now();
        await products.insertOne(p);
        return p;
      }
    },
    async deleteProduct(id) {
      const res = await products.deleteOne({ id: Number(id) });
      return res.deletedCount > 0;
    },
    async getSettings() {
      const doc = await settings.findOne({ _id: 'main' });
      if (!doc) return {};
      const { _id, ...rest } = doc;
      return rest;
    },
    async saveSettings(patch) {
      const current = await this.getSettings();
      const updated = { ...current, ...patch };
      await settings.updateOne({ _id: 'main' }, { $set: updated }, { upsert: true });
      return updated;
    }
  };
}

/* =====================================================================
   ROUTES
===================================================================== */

app.use(express.json({ limit: '25mb' })); // зурган upload-д зориулж хэмжээг нэмэгдүүлсэн
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/orders', async (req, res) => {
  const { name, phone, items, total } = req.body;
  if (!name || !phone || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, error: 'Мэдээлэл дутуу байна.' });
  }
  const newOrder = {
    id: Date.now(),
    name: String(name).slice(0, 200),
    phone: String(phone).slice(0, 50),
    items, total: Number(total) || 0,
    status: 'Шинэ',
    createdAt: new Date().toISOString()
  };
  await store.addOrder(newOrder);
  console.log(`Шинэ захиалга: ${newOrder.name} (${newOrder.phone}) — ${newOrder.total}₮`);
  res.json({ ok: true, orderId: newOrder.id });
});

app.get('/api/orders', async (req, res) => {
  if (!checkKey(req, res)) return;
  res.json({ ok: true, orders: await store.getOrders() });
});

app.post('/api/orders/:id/status', async (req, res) => {
  if (!checkKey(req, res)) return;
  const ok = await store.setOrderStatus(req.params.id, req.body.status);
  if (!ok) return res.status(404).json({ ok: false, error: 'Захиалга олдсонгүй.' });
  res.json({ ok: true });
});

app.get('/api/products', async (req, res) => {
  res.json({ ok: true, products: await store.getProducts() });
});

app.post('/api/products', async (req, res) => {
  if (!checkKey(req, res)) return;
  const p = req.body.product;
  if (!p || !p.name || !p.cat || !p.price) {
    return res.status(400).json({ ok: false, error: 'Бүтээгдэхүүний мэдээлэл дутуу байна.' });
  }
  const saved = await store.saveProduct(p);
  if (!saved) return res.status(404).json({ ok: false, error: 'Бүтээгдэхүүн олдсонгүй.' });
  res.json({ ok: true, product: saved });
});

app.delete('/api/products/:id', async (req, res) => {
  if (!checkKey(req, res)) return;
  const ok = await store.deleteProduct(req.params.id);
  if (!ok) return res.status(404).json({ ok: false, error: 'Бүтээгдэхүүн олдсонгүй.' });
  res.json({ ok: true });
});

app.get('/api/settings', async (req, res) => {
  res.json({ ok: true, settings: await store.getSettings() });
});

app.post('/api/settings', async (req, res) => {
  if (!checkKey(req, res)) return;
  const updated = await store.saveSettings(req.body.settings || {});
  res.json({ ok: true, settings: updated });
});

/* =====================================================================
   START
===================================================================== */

async function start() {
  if (MONGODB_URI) {
    try {
      await initMongoStore();
    } catch (e) {
      console.error('❌ MongoDB холболт амжилтгүй боллоо, JSON файл руу шилжиж байна:', e.message);
      await initFileStore();
    }
  } else {
    await initFileStore();
  }

  app.listen(PORT, () => {
    console.log(`BERRY backend ажиллаж байна: http://localhost:${PORT}`);
  });
}

start();
