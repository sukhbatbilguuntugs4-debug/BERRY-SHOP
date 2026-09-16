// server.js — BERRY дэлгүүрийн backend
// MONGODB_URI байвал MongoDB Atlas-д (найдвартай, мөнхийн) хадгална.
// Байхгүй бол хуучин шигээ локал JSON файлд хадгална.

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'berry2026';
const MONGODB_URI = process.env.MONGODB_URI || '';

const DATA_DIR = path.join(__dirname, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');
const COUPONS_FILE = path.join(DATA_DIR, 'coupons.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]', 'utf-8');
if (!fs.existsSync(PRODUCTS_FILE)) fs.writeFileSync(PRODUCTS_FILE, '[]', 'utf-8');
if (!fs.existsSync(REVIEWS_FILE)) fs.writeFileSync(REVIEWS_FILE, '[]', 'utf-8');
if (!fs.existsSync(COUPONS_FILE)) fs.writeFileSync(COUPONS_FILE, '[]', 'utf-8');
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

let store;

async function initFileStore(reason) {
  console.log(reason || '⚠️  MONGODB_URI олдсонгүй — локал JSON файлд хадгалж байна (Render free tier дээр диск бэхжихгүй байж болно).');
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
    async getOrdersByPhone(phone) {
      const orders = readJSON(ORDERS_FILE) || [];
      return orders.filter(o => o.phone === phone);
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
    },

    async getReviews(productId) {
      const reviews = readJSON(REVIEWS_FILE) || [];
      return reviews.filter(r => String(r.productId) === String(productId)).sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));
    },
    async addReview(review) {
      const reviews = readJSON(REVIEWS_FILE) || [];
      reviews.push(review);
      writeJSON(REVIEWS_FILE, reviews);
    },
    async deleteReview(id) {
      let reviews = readJSON(REVIEWS_FILE) || [];
      const before = reviews.length;
      reviews = reviews.filter(r => String(r.id) !== String(id));
      writeJSON(REVIEWS_FILE, reviews);
      return reviews.length !== before;
    },

    async getCoupons() { return readJSON(COUPONS_FILE) || []; },
    async getCoupon(code) {
      const coupons = readJSON(COUPONS_FILE) || [];
      return coupons.find(c => c.code.toUpperCase() === code.toUpperCase() && c.active) || null;
    },
    async saveCoupon(c) {
      const coupons = readJSON(COUPONS_FILE) || [];
      const idx = coupons.findIndex(x => x.code.toUpperCase() === c.code.toUpperCase());
      if (idx === -1) coupons.push(c); else coupons[idx] = c;
      writeJSON(COUPONS_FILE, coupons);
      return c;
    },
    async deleteCoupon(code) {
      let coupons = readJSON(COUPONS_FILE) || [];
      const before = coupons.length;
      coupons = coupons.filter(c => c.code.toUpperCase() !== code.toUpperCase());
      writeJSON(COUPONS_FILE, coupons);
      return coupons.length !== before;
    }
  };
}

async function initMongoStore() {
  const { MongoClient, ServerApiVersion } = require('mongodb');
  const client = new MongoClient(MONGODB_URI, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
    family: 4
  });
  await client.connect();
  const db = client.db('berry_shop');
  const orders = db.collection('orders');
  const products = db.collection('products');
  const settings = db.collection('settings');
  const reviews = db.collection('reviews');
  const coupons = db.collection('coupons');

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
    async addOrder(order) { await orders.insertOne(order); },
    async setOrderStatus(id, status) {
      const res = await orders.updateOne({ id: Number(id) }, { $set: { status } });
      return res.matchedCount > 0;
    },
    async getOrdersByPhone(phone) {
      return await orders.find({ phone }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
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
    },

    async getReviews(productId) {
      return await reviews.find({ productId: String(productId) }, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
    },
    async addReview(review) { await reviews.insertOne(review); },
    async deleteReview(id) {
      const res = await reviews.deleteOne({ id: Number(id) });
      return res.deletedCount > 0;
    },

    async getCoupons() {
      return await coupons.find({}, { projection: { _id: 0 } }).toArray();
    },
    async getCoupon(code) {
      return await coupons.findOne({ codeUpper: code.toUpperCase(), active: true }, { projection: { _id: 0 } });
    },
    async saveCoupon(c) {
      c.codeUpper = c.code.toUpperCase();
      await coupons.replaceOne({ codeUpper: c.codeUpper }, c, { upsert: true });
      return c;
    },
    async deleteCoupon(code) {
      const res = await coupons.deleteOne({ codeUpper: code.toUpperCase() });
      return res.deletedCount > 0;
    }
  };
}

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- ЗАХИАЛГА ---------- */

app.post('/api/orders', async (req, res) => {
  const { name, phone, address, items, total, couponCode, discount } = req.body;
  if (!name || !phone || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, error: 'Мэдээлэл дутуу байна.' });
  }
  const newOrder = {
    id: Date.now(),
    name: String(name).slice(0, 200),
    phone: String(phone).slice(0, 50),
    address: String(address || '').slice(0, 300),
    items, total: Number(total) || 0,
    couponCode: couponCode ? String(couponCode).slice(0, 40) : null,
    discount: Number(discount) || 0,
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

// Хэрэглэгч утасны дугаараараа өөрийн захиалгаа хайх (нээлттэй, admin key шаардахгүй)
app.get('/api/orders/track', async (req, res) => {
  const phone = (req.query.phone || '').trim();
  if (!phone) return res.status(400).json({ ok: false, error: 'Утасны дугаараа оруулна уу.' });
  const orders = await store.getOrdersByPhone(phone);
  res.json({ ok: true, orders });
});

/* ---------- БҮТЭЭГДЭХҮҮН ---------- */

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

/* ---------- ТОХИРГОО ---------- */

app.get('/api/settings', async (req, res) => {
  res.json({ ok: true, settings: await store.getSettings() });
});

app.post('/api/settings', async (req, res) => {
  if (!checkKey(req, res)) return;
  const updated = await store.saveSettings(req.body.settings || {});
  res.json({ ok: true, settings: updated });
});

/* ---------- СЭТГЭГДЭЛ ---------- */

app.get('/api/reviews', async (req, res) => {
  const productId = req.query.productId;
  if (!productId) return res.status(400).json({ ok: false, error: 'productId шаардлагатай.' });
  res.json({ ok: true, reviews: await store.getReviews(productId) });
});

app.post('/api/reviews', async (req, res) => {
  const { productId, name, rating, comment } = req.body;
  if (!productId || !name || !rating || !comment) {
    return res.status(400).json({ ok: false, error: 'Мэдээлэл дутуу байна.' });
  }
  const r = Number(rating);
  if (r < 1 || r > 5) return res.status(400).json({ ok: false, error: 'Үнэлгээ 1-5 хооронд байх ёстой.' });
  const review = {
    id: Date.now(),
    productId: String(productId),
    name: String(name).slice(0, 100),
    rating: r,
    comment: String(comment).slice(0, 1000),
    createdAt: new Date().toISOString()
  };
  await store.addReview(review);
  res.json({ ok: true, review });
});

app.delete('/api/reviews/:id', async (req, res) => {
  if (!checkKey(req, res)) return;
  const ok = await store.deleteReview(req.params.id);
  if (!ok) return res.status(404).json({ ok: false, error: 'Сэтгэгдэл олдсонгүй.' });
  res.json({ ok: true });
});

/* ---------- ХЯМДРАЛЫН КОД ---------- */

app.get('/api/coupons', async (req, res) => {
  if (!checkKey(req, res)) return;
  res.json({ ok: true, coupons: await store.getCoupons() });
});

// Хэрэглэгч кодоо шалгах (нээлттэй)
app.get('/api/coupons/check', async (req, res) => {
  const code = (req.query.code || '').trim();
  if (!code) return res.status(400).json({ ok: false, error: 'Код оруулна уу.' });
  const coupon = await store.getCoupon(code);
  if (!coupon) return res.status(404).json({ ok: false, error: 'Код олдсонгүй эсвэл идэвхгүй байна.' });
  res.json({ ok: true, coupon });
});

app.post('/api/coupons', async (req, res) => {
  if (!checkKey(req, res)) return;
  const { code, type, value, active } = req.body;
  if (!code || !type || value == null) {
    return res.status(400).json({ ok: false, error: 'Мэдээлэл дутуу байна.' });
  }
  const coupon = { code: String(code).trim(), type, value: Number(value), active: active !== false };
  const saved = await store.saveCoupon(coupon);
  res.json({ ok: true, coupon: saved });
});

app.delete('/api/coupons/:code', async (req, res) => {
  if (!checkKey(req, res)) return;
  const ok = await store.deleteCoupon(req.params.code);
  if (!ok) return res.status(404).json({ ok: false, error: 'Код олдсонгүй.' });
  res.json({ ok: true });
});

/* ---------- START ---------- */

async function start() {
  if (MONGODB_URI) {
    try {
      await initMongoStore();
    } catch (e) {
      console.error('❌ MongoDB холболт амжилтгүй боллоо, JSON файл руу шилжиж байна:', e.message);
      await initFileStore('⚠️  MongoDB холболт амжилтгүй болсон тул локал JSON файлд хадгалж байна.');
    }
  } else {
    await initFileStore();
  }

  app.listen(PORT, () => {
    console.log(`BERRY backend ажиллаж байна: http://localhost:${PORT}`);
  });
}

start();
