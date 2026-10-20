require('dotenv').config();
const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const { db, initDB } = require('./db');

// ── Email (Resend API или nodemailer/SMTP) ────────────────────────────────────
let mailer = null;
const NOTIFY_TO = process.env.NOTIFY_EMAIL || 'geoplast.v.eood@gmail.com';

const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@geoplast.bg';

async function sendViaResend(subject, html, to = NOTIFY_TO) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `Геопласт Магазин <${FROM_EMAIL}>`, to: Array.isArray(to) ? to : [to], subject, html })
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

try {
  if (process.env.RESEND_API_KEY) {
    mailer = 'resend';
    console.log('✉️  Email via Resend API →', NOTIFY_TO);
  } else if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    const nodemailer = require('nodemailer');
    mailer = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
    console.log('✉️  Email via SMTP (Gmail) →', process.env.SMTP_USER);
  } else {
    console.log('ℹ️  Email disabled — add RESEND_API_KEY or SMTP_USER+SMTP_PASS in Render env vars');
  }
} catch (e) { console.log('ℹ️  Email init error:', e.message); }

function buildEmailHtml(order, items) {
  const itemsHtml = items.map(i =>
    `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${i.name}</td>
     <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${i.qty}</td>
     <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${(i.price * i.qty).toFixed(2)} €</td></tr>`
  ).join('');
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <div style="background:#1a1a2e;padding:20px 24px;border-radius:8px 8px 0 0">
        <h2 style="color:#fff;margin:0">🛒 Нова поръчка — Геопласт</h2>
        <div style="color:#ff952b;font-size:18px;font-weight:700;margin-top:6px">${order.order_number}</div>
      </div>
      <div style="border:1px solid #e0e0e0;border-top:none;padding:24px;border-radius:0 0 8px 8px">
        <h3 style="margin:0 0 12px;color:#1a1a2e">Клиент</h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
          <tr><td style="color:#666;padding:4px 0;width:120px">Имена:</td><td style="font-weight:700">${order.customer_name}</td></tr>
          <tr><td style="color:#666;padding:4px 0">Телефон:</td><td style="font-weight:700">${order.customer_phone}</td></tr>
          <tr><td style="color:#666;padding:4px 0">Имейл:</td><td>${order.customer_email || '—'}</td></tr>
          <tr><td style="color:#666;padding:4px 0">Град:</td><td>${order.customer_city}</td></tr>
          <tr><td style="color:#666;padding:4px 0">Адрес:</td><td>${order.customer_address}</td></tr>
          <tr><td style="color:#666;padding:4px 0">Плащане:</td><td>${order.payment_method === 'bank' ? 'Банков превод' : 'Наложен платеж'}</td></tr>
          ${order.notes ? `<tr><td style="color:#666;padding:4px 0">Бележки:</td><td>${order.notes}</td></tr>` : ''}
        </table>
        <h3 style="margin:0 0 12px;color:#1a1a2e">Продукти</h3>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="background:#f5f5f5">
            <th style="padding:8px 10px;text-align:left">Продукт</th>
            <th style="padding:8px 10px;text-align:center">Бр.</th>
            <th style="padding:8px 10px;text-align:right">Сума</th>
          </tr></thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <div style="margin-top:16px;text-align:right;font-size:18px;font-weight:900;color:#ff952b">
          Общо: ${order.total.toFixed(2)} € <span style="font-size:12px;color:#999;font-weight:400">+ безплатна доставка</span>
        </div>
      </div>
    </div>`;
}

function buildCustomerEmailHtml(order, items, siteUrl) {
  const itemsHtml = items.map(i =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">${i.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center">${i.qty}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:700">${(i.price*i.qty).toFixed(2)} €</td>
    </tr>`
  ).join('');
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const trackUrl = `${siteUrl}/track.html?order=${order.order_number}`;
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#333">
      <div style="background:#1a1a2e;padding:24px;border-radius:10px 10px 0 0;text-align:center">
        <img src="${siteUrl}/images/geoplast_logo.png" alt="Геопласт" style="height:60px;object-fit:contain">
      </div>
      <div style="background:#ff952b;padding:14px 24px">
        <h2 style="margin:0;color:#fff;font-size:18px">✅ Поръчката е приета!</h2>
      </div>
      <div style="border:1px solid #e0e0e0;border-top:none;padding:24px;border-radius:0 0 10px 10px;background:#fff">
        <p style="margin:0 0 6px">Здравейте, <strong>${order.customer_name}</strong>,</p>
        <p style="margin:0 0 20px;color:#666">Получихме вашата поръчка. Ще се свържем с вас скоро за потвърждение.</p>

        <div style="background:#f8f8f8;border-radius:8px;padding:14px 18px;margin-bottom:20px">
          <div style="font-size:12px;color:#999;margin-bottom:4px">НОМЕР НА ПОРЪЧКА</div>
          <div style="font-size:22px;font-weight:900;color:#1a1a2e">${order.order_number}</div>
        </div>

        <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
          <thead>
            <tr style="background:#f5f5f5">
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#666">Продукт</th>
              <th style="padding:8px 12px;text-align:center;font-size:12px;color:#666">Бр.</th>
              <th style="padding:8px 12px;text-align:right;font-size:12px;color:#666">Сума</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <div style="text-align:right;font-size:16px;font-weight:900;color:#ff952b;margin-bottom:24px">
          Общо: ${total.toFixed(2)} € <span style="font-size:12px;color:#999;font-weight:400">(с ДДС + безплатна доставка)</span>
        </div>

        <div style="text-align:center;margin-bottom:24px">
          <a href="${trackUrl}" style="display:inline-block;background:#ff952b;color:#fff;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;text-decoration:none">
            📦 Проследи поръчката си →
          </a>
        </div>

        <div style="border-top:1px solid #f0f0f0;padding-top:16px;font-size:12px;color:#999;text-align:center">
          Доставка чрез Интерлогистик · Геопласт ЕООД · 0887 77 89 92
        </div>
      </div>
    </div>`;
}

async function sendOrderEmail(order, items) {
  if (!mailer) return;
  const siteUrl = process.env.SITE_URL || 'https://geoplast.bg';

  // Email to shop owner
  const ownerSubject = `🛒 Нова поръчка ${order.order_number} — ${order.customer_name}`;
  const ownerHtml = buildEmailHtml(order, items);

  // Email to customer (only if they provided email and domain is verified)
  const customerEmail = order.customer_email;
  const customerSubject = `✅ Поръчка ${order.order_number} е приета — Геопласт`;
  const customerHtml = buildCustomerEmailHtml(order, items, siteUrl);

  try {
    if (mailer === 'resend') {
      await sendViaResend(ownerSubject, ownerHtml, NOTIFY_TO);
      if (customerEmail) {
        await sendViaResend(customerSubject, customerHtml, customerEmail).catch(e =>
          console.error('Customer email error (domain not verified?):', e.message));
      }
    } else {
      await mailer.sendMail({ from: `"Геопласт Магазин" <${process.env.SMTP_USER}>`, to: NOTIFY_TO, subject: ownerSubject, html: ownerHtml });
      if (customerEmail) {
        await mailer.sendMail({ from: `"Геопласт Магазин" <${process.env.SMTP_USER}>`, to: customerEmail, subject: customerSubject, html: customerHtml })
          .catch(e => console.error('Customer email error:', e.message));
      }
    }
    console.log(`✉️  Order emails sent: ${order.order_number}${customerEmail ? ' + customer' : ''}`);
  } catch (e) { console.error('Email error:', e.message); }
}

const app = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Multer — product images
const imgStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `img_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({
  storage: imgStorage,
  fileFilter: (req, file, cb) => {
    const ok = ['.jpg', '.jpeg', '.png', '.webp', '.svg'].includes(path.extname(file.originalname).toLowerCase());
    cb(null, ok);
  },
  limits: { fileSize: 8 * 1024 * 1024 }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'geoplast-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, 'public')));

const requireAdmin = (req, res, next) => {
  if (req.session.isAdmin) return next();
  res.status(401).json({ error: 'Unauthorized' });
};

// ── ADMIN AUTH ──────────────────────────────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === (process.env.ADMIN_PASSWORD || 'geoplast2024')) {
    req.session.isAdmin = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Грешна парола' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/admin/check', (req, res) => {
  res.json({ isAdmin: !!req.session.isAdmin });
});

// ── SETTINGS ────────────────────────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
});

app.put('/api/settings', requireAdmin, (req, res) => {
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(req.body)) stmt.run(k, v);
  res.json({ ok: true });
});

// Logo upload
app.post('/api/settings/logo', requireAdmin, upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const p = `/uploads/${req.file.filename}`;
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('logo', p);
  res.json({ ok: true, path: p });
});

// ── PRODUCTS ────────────────────────────────────────────────────────────────
app.get('/api/products', (req, res) => {
  const { category, search, limit = 100, offset = 0 } = req.query;
  let q = `SELECT p.*,
    (SELECT COUNT(*) FROM product_variations WHERE product_id = p.id AND active = 1) as var_count
    FROM products p WHERE p.active = 1`;
  const p = [];
  if (category && category !== 'all') { q += ' AND p.category = ?'; p.push(category); }
  if (search) { q += ' AND (p.name LIKE ? OR p.description LIKE ? OR p.code LIKE ?)'; p.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  q += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
  p.push(parseInt(limit), parseInt(offset));
  res.json(db.prepare(q).all(...p));
});

app.get('/api/products/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  p.variations = db.prepare('SELECT * FROM product_variations WHERE product_id = ? AND active = 1 ORDER BY sort_order').all(req.params.id);
  p.var_count = p.variations.length;
  res.json(p);
});

// Variations CRUD (admin)
app.get('/api/products/:id/variations', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM product_variations WHERE product_id = ? ORDER BY sort_order').all(req.params.id));
});

app.post('/api/products/:id/variations', requireAdmin, (req, res) => {
  const { name, description, price_modifier, stock, sort_order } = req.body;
  const r = db.prepare(`INSERT INTO product_variations (product_id, name, description, price_modifier, stock, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)`).run(req.params.id, name, description || '', parseFloat(price_modifier) || 0, parseInt(stock) || 0, parseInt(sort_order) || 0);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/variations/:id', requireAdmin, (req, res) => {
  const { name, description, price_modifier, stock, active, sort_order } = req.body;
  db.prepare(`UPDATE product_variations SET name=?, description=?, price_modifier=?, stock=?, active=?, sort_order=? WHERE id=?`)
    .run(name, description || '', parseFloat(price_modifier) || 0, parseInt(stock) || 0, active !== undefined ? parseInt(active) : 1, parseInt(sort_order) || 0, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/variations/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM product_variations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/variations/:id/image', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const imgPath = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE product_variations SET image=? WHERE id=?').run(imgPath, req.params.id);
  res.json({ path: imgPath });
});

app.post('/api/products', requireAdmin, upload.single('image'), (req, res) => {
  const { name, description, price, old_price, category, code, stock, unit } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;
  const r = db.prepare(`
    INSERT INTO products (name, description, price, old_price, category, code, stock, unit, image, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(name, description, parseFloat(price), old_price ? parseFloat(old_price) : null,
    category, code, parseInt(stock) || 0, unit || 'бр.', image);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/products/:id', requireAdmin, upload.single('image'), (req, res) => {
  const { name, description, price, old_price, category, code, stock, unit, active } = req.body;
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const image = req.file ? `/uploads/${req.file.filename}` : existing.image;
  const newPrice = parseFloat(price);
  const oldPrice = parseFloat(existing.price);
  db.prepare(`
    UPDATE products SET name=?, description=?, price=?, old_price=?, category=?, code=?, stock=?, unit=?, image=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(name, description, newPrice, old_price ? parseFloat(old_price) : null,
    category, code, parseInt(stock) || 0, unit || 'бр.', image,
    active !== undefined ? parseInt(active) : existing.active, req.params.id);
  // When base price changes, keep absolute variation prices stable by adjusting modifiers
  if (newPrice !== oldPrice) {
    const variations = db.prepare('SELECT id, price_modifier FROM product_variations WHERE product_id = ?').all(req.params.id);
    for (const v of variations) {
      const absPrice = oldPrice + (v.price_modifier || 0);
      const newMod = parseFloat((absPrice - newPrice).toFixed(4));
      db.prepare('UPDATE product_variations SET price_modifier = ? WHERE id = ?').run(newMod, v.id);
    }
  }
  res.json({ ok: true });
});

app.delete('/api/products/:id', requireAdmin, (req, res) => {
  db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── ORDERS ──────────────────────────────────────────────────────────────────
app.post('/api/orders', (req, res) => {
  const { customer, items, courier, courier_city_id, courier_price, payment_method, notes } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'Няма продукти' });

  const products_total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const total = products_total + (parseFloat(courier_price) || 0);
  const orderNum = `GP-${Date.now().toString().slice(-8)}`;

  const r = db.prepare(`
    INSERT INTO orders (order_number, customer_name, customer_phone, customer_email, customer_address, customer_city, courier, courier_city_id, courier_price, payment_method, notes, status, products_total, total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(orderNum, customer.name, customer.phone, customer.email || '',
    customer.address, customer.city, courier, courier_city_id || '',
    parseFloat(courier_price) || 0, payment_method || 'cod', notes || '',
    products_total, total);

  // lastInsertRowid from sql.js adapter is unreliable — query directly
  const insertedOrder = db.prepare('SELECT id FROM orders WHERE order_number = ?').get(orderNum);
  const orderId = insertedOrder ? Number(insertedOrder.id) : 0;
  console.log(`[ORDER] ${orderNum} created id=${orderId}, ${items.length} items, total=${total}`);
  for (const item of items) {
    const itemName = String(item.name || '').trim() || 'Продукт';
    const itemPrice = parseFloat(item.price) || 0;
    const itemQty = parseInt(item.qty) || 1;
    try {
      db.prepare('INSERT INTO order_items (order_id, product_id, product_name, price, qty) VALUES (?, ?, ?, ?, ?)')
        .run(orderId, item.id ? Number(item.id) : null, itemName, itemPrice, itemQty);
      console.log(`  [ITEM OK] ${itemName} x${itemQty} @ ${itemPrice}`);
    } catch (e) {
      console.error(`  [ITEM ERR] ${itemName}: ${e.message}`);
    }
    if (item.id) {
      try {
        db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?').run(itemQty, Number(item.id));
      } catch (e) { console.error(`  [STOCK ERR] id=${item.id}: ${e.message}`); }
    }
  }

  // Send email notification
  const orderRecord = { order_number: orderNum, customer_name: customer.name, customer_phone: customer.phone,
    customer_email: customer.email || '', customer_city: customer.city, customer_address: customer.address,
    payment_method: payment_method || 'cod', notes: notes || '', total };
  sendOrderEmail(orderRecord, items).catch(() => {});

  res.json({ ok: true, order_number: orderNum, order_id: orderId });
});

app.get('/api/orders', requireAdmin, (req, res) => {
  const { status, limit = 100, offset = 0 } = req.query;
  let q = `SELECT o.*, GROUP_CONCAT(oi.product_name || ' x' || oi.qty, '; ') as items_summary
    FROM orders o LEFT JOIN order_items oi ON o.id = oi.order_id`;
  const p = [];
  if (status) { q += ' WHERE o.status = ?'; p.push(status); }
  q += ' GROUP BY o.id ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
  p.push(parseInt(limit), parseInt(offset));
  res.json(db.prepare(q).all(...p));
});

app.get('/api/orders/:id', requireAdmin, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(req.params.id);
  res.json(order);
});

app.put('/api/orders/:id/status', requireAdmin, async (req, res) => {
  const { status, tracking_number } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Not found' });

  db.prepare('UPDATE orders SET status=?, tracking_number=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(status, tracking_number || null, req.params.id);

  // Send status notification to customer if they provided email
  if (order.customer_email && mailer) {
    const labels = { pending:'В очакване', processing:'В обработка', shipped:'Изпратена', delivered:'Доставена', cancelled:'Отказана' };
    const statusBg = { pending:'#888', processing:'#2563eb', shipped:'#f59e0b', delivered:'#16a34a', cancelled:'#dc2626' };
    const label = labels[status] || status;
    const color = statusBg[status] || '#888';
    const trackHtml = tracking_number ? `<p style="margin:16px 0 0"><strong>Номер за проследяване:</strong> ${tracking_number}</p>` : '';
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
        <div style="background:#1a1a2e;padding:20px 24px;border-radius:8px 8px 0 0">
          <h2 style="color:#fff;margin:0">📦 Статус на поръчка — Геопласт</h2>
          <div style="color:#ff952b;font-size:16px;font-weight:700;margin-top:6px">${order.order_number}</div>
        </div>
        <div style="border:1px solid #e0e0e0;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p style="margin:0 0 16px">Здравейте, <strong>${order.customer_name}</strong>,</p>
          <p style="margin:0 0 16px">Статусът на вашата поръчка беше променен:</p>
          <div style="background:${color};color:#fff;font-size:18px;font-weight:700;padding:12px 20px;border-radius:8px;display:inline-block">${label}</div>
          ${trackHtml}
          <p style="margin:20px 0 0;color:#666;font-size:13px">При въпроси се свържете с нас на <strong>0887 77 89 92</strong></p>
        </div>
      </div>`;
    try {
      await sendViaResend(`Поръчка ${order.order_number} — ${label}`, html, order.customer_email);
    } catch(e) { console.error('[STATUS EMAIL]', e.message); }
  }

  res.json({ ok: true });
});

// ── ANALYTICS ───────────────────────────────────────────────────────────────
app.get('/api/analytics', requireAdmin, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const d7  = new Date(Date.now() - 7  * 86400000).toISOString().split('T')[0];
  const d30 = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const g = (q, ...p) => db.prepare(q).get(...p).val;
  res.json({
    revenue_today:  g(`SELECT COALESCE(SUM(total),0) as val FROM orders WHERE date(created_at)=? AND status!='cancelled'`, today),
    revenue_week:   g(`SELECT COALESCE(SUM(total),0) as val FROM orders WHERE date(created_at)>=? AND status!='cancelled'`, d7),
    revenue_month:  g(`SELECT COALESCE(SUM(total),0) as val FROM orders WHERE date(created_at)>=? AND status!='cancelled'`, d30),
    orders_today:   g(`SELECT COUNT(*) as val FROM orders WHERE date(created_at)=?`, today),
    orders_pending: g(`SELECT COUNT(*) as val FROM orders WHERE status='pending'`),
    total_products: g(`SELECT COUNT(*) as val FROM products WHERE active=1`),
    total_subscribers: g(`SELECT COUNT(*) as val FROM subscribers`),
    revenue_by_day: db.prepare(`SELECT date(created_at) as day, SUM(total) as revenue, COUNT(*) as orders FROM orders WHERE date(created_at)>=? AND status!='cancelled' GROUP BY date(created_at) ORDER BY day`).all(d30),
    top_products:   db.prepare(`SELECT oi.product_name, SUM(oi.qty) as total_qty, SUM(oi.price*oi.qty) as total_revenue FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE o.status!='cancelled' GROUP BY oi.product_name ORDER BY total_revenue DESC LIMIT 8`).all(),
    status_breakdown: db.prepare(`SELECT status, COUNT(*) as count FROM orders GROUP BY status`).all(),
    recent_orders: db.prepare(`SELECT id, order_number, customer_name, customer_city, total, status, created_at FROM orders ORDER BY created_at DESC LIMIT 10`).all()
  });
});

// ── SHIPPING — SPEEDY ────────────────────────────────────────────────────────
const SPEEDY_USER = process.env.SPEEDY_USERNAME || '';
const SPEEDY_PASS = process.env.SPEEDY_PASSWORD || '';
const SENDER_CITY_ID = 143; // Варна

const BG_CITIES = [
  { id: 143, name: 'Варна' }, { id: 68134, name: 'Варна (Владиславово)' },
  { id: 100, name: 'София' }, { id: 200, name: 'Пловдив' }, { id: 300, name: 'Бургас' },
  { id: 400, name: 'Русе' }, { id: 500, name: 'Стара Загора' }, { id: 600, name: 'Плевен' },
  { id: 700, name: 'Сливен' }, { id: 800, name: 'Добрич' }, { id: 900, name: 'Шумен' },
  { id: 1000, name: 'Перник' }, { id: 1100, name: 'Хасково' }, { id: 1200, name: 'Ямбол' },
  { id: 1300, name: 'Пазарджик' }, { id: 1400, name: 'Благоевград' }, { id: 1500, name: 'Велико Търново' },
  { id: 1600, name: 'Враца' }, { id: 1700, name: 'Габрово' }, { id: 1800, name: 'Видин' },
  { id: 1900, name: 'Монтана' }, { id: 2000, name: 'Кърджали' }, { id: 2100, name: 'Ловеч' },
  { id: 2200, name: 'Разград' }, { id: 2300, name: 'Силистра' }, { id: 2400, name: 'Търговище' },
  { id: 2500, name: 'Смолян' }, { id: 2600, name: 'Кюстендил' }, { id: 2700, name: 'Бяла Слатина' },
  { id: 2800, name: 'Свищов' }, { id: 2900, name: 'Асеновград' }, { id: 3000, name: 'Казанлък' },
];

app.post('/api/shipping/speedy/cities', async (req, res) => {
  const { name } = req.body;
  if (!SPEEDY_USER) {
    const q = (name || '').toLowerCase();
    const cities = BG_CITIES.filter(c => c.name.toLowerCase().includes(q));
    return res.json({ cities, demo: true });
  }
  try {
    const r = await fetch('https://api.speedy.bg/v1/location/city/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userName: SPEEDY_USER, password: SPEEDY_PASS, language: 'BG', countryId: 100, name })
    });
    res.json(await r.json());
  } catch (e) { res.json({ cities: [], error: e.message }); }
});

app.post('/api/shipping/speedy/calculate', async (req, res) => {
  const { city_id, weight = 1.0, parcels = 1 } = req.body;
  if (!SPEEDY_USER) {
    return res.json({ price: 7.99, currency: 'BGN', demo: true, note: 'Демо цена — добавете Speedy API ключове в .env' });
  }
  try {
    const today = new Date().toISOString().split('T')[0];
    const r = await fetch('https://api.speedy.bg/v1/calculation/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: SPEEDY_USER, password: SPEEDY_PASS, language: 'BG',
        sender: { city: { id: SENDER_CITY_ID } },
        recipient: { city: { id: parseInt(city_id) } },
        service: { pickupDate: today, serviceIds: [505] },
        content: { parcelsCount: parseInt(parcels), totalWeight: parseFloat(weight), contents: 'Крепежни елементи' },
        payment: { courierServicePayer: 'RECIPIENT' }
      })
    });
    const data = await r.json();
    if (data.calculations && data.calculations.length > 0) {
      const c = data.calculations[0];
      res.json({ price: c.price?.total, currency: c.price?.currency || 'BGN', days: c.deliveryDeadline });
    } else {
      res.json({ price: 7.99, currency: 'BGN', error: data.error?.message });
    }
  } catch (e) { res.json({ price: 7.99, currency: 'BGN', error: e.message }); }
});

// ── SHIPPING — ECONT ─────────────────────────────────────────────────────────
app.post('/api/shipping/econt/cities', async (req, res) => {
  try {
    const r = await fetch('https://ee.econt.com/services/Nomenclatures/NomenclaturesService.getCities.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ countryCode: 'BGR' })
    });
    res.json(await r.json());
  } catch (e) { res.json({ cities: [], error: e.message }); }
});

app.post('/api/shipping/econt/offices', async (req, res) => {
  const { city_id } = req.body;
  try {
    const r = await fetch('https://ee.econt.com/services/Nomenclatures/NomenclaturesService.getOffices.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city: { id: city_id } })
    });
    res.json(await r.json());
  } catch (e) { res.json({ offices: [], error: e.message }); }
});

app.post('/api/shipping/econt/calculate', async (req, res) => {
  // Approximate pricing until full Econt API credentials are configured
  const { city } = req.body;
  let price = 6.50;
  const c = (city || '').toLowerCase();
  if (c.includes('варна') || c.includes('varna')) price = 5.50;
  else if (c.includes('софия') || c.includes('sofia') || c.includes('пловдив')) price = 7.00;
  res.json({ price, currency: 'BGN', days: '1-2', note: 'Приблизителна цена' });
});

// ── TRACKING ─────────────────────────────────────────────────────────────────
app.get('/api/track/:number', async (req, res) => {
  const { number } = req.params;
  const order = db.prepare('SELECT * FROM orders WHERE tracking_number = ? OR order_number = ?').get(number, number);
  if (order) {
    return res.json({ found: true, source: 'internal', order });
  }
  if (SPEEDY_USER) {
    try {
      const r = await fetch(`https://api.speedy.bg/v1/track/?paramType=1&param=${encodeURIComponent(number)}&userName=${SPEEDY_USER}&password=${SPEEDY_PASS}&language=BG`);
      const data = await r.json();
      if (data.parcels && data.parcels.length > 0) {
        return res.json({ found: true, source: 'speedy', parcel: data.parcels[0] });
      }
    } catch (e) { /* ignore */ }
  }
  res.json({ found: false });
});

// ── CONTACT FORM ─────────────────────────────────────────────────────────────
// Mixed-case Latin run of 12+ letters, e.g. "jxlfEjOHaqBMMiOylAJ" — never a real name or word
function hasRandomToken(s) {
  return String(s || '').split(/\s+/).some(w =>
    /^[A-Za-z]{12,}$/.test(w) && (w.match(/[A-Z]/g) || []).length >= 4 && (w.match(/[a-z]/g) || []).length >= 4
  );
}

// reCAPTCHA is enforced only when both keys are set in the environment
const RECAPTCHA_SITE_KEY = process.env.RECAPTCHA_SITE_KEY || '';
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET || '';

async function recaptchaOk(token, ip) {
  if (!RECAPTCHA_SITE_KEY || !RECAPTCHA_SECRET) return true;
  if (!token) return false;
  try {
    const r = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: RECAPTCHA_SECRET, response: token, remoteip: ip || '' }).toString()
    });
    const data = await r.json();
    // v3 returns a 0–1 score; 0.3 is lenient so real customers on VPNs/new browsers still get through
    const ok = data.success === true && (data.score === undefined || data.score >= 0.3);
    if (!ok) console.log(`reCAPTCHA rejected: success=${data.success} score=${data.score} errors=${(data['error-codes'] || []).join(',')}`);
    return ok;
  } catch (e) {
    // Google unreachable: let it through rather than lose a real customer; the checks above still ran
    console.error('reCAPTCHA verify error:', e.message);
    return true;
  }
}

app.get('/api/recaptcha-key', (req, res) => {
  res.json({ siteKey: RECAPTCHA_SITE_KEY && RECAPTCHA_SECRET ? RECAPTCHA_SITE_KEY : '' });
});

app.post('/api/contact', async (req, res) => {
  const { name, phone, email, subject, message, website, _t, recaptcha } = req.body;
  if (!name || !phone || !message) return res.status(400).json({ error: 'Попълнете задължителните полета' });
  // Spam gets a fake success so the bot doesn't adapt
  const spamReason = website ? 'honeypot'
    : !(Number(_t) >= 3000) ? 'too-fast'
    : (hasRandomToken(name) || hasRandomToken(message)) ? 'random-text'
    : null;
  if (spamReason) {
    console.log(`🚫 Spam blocked (${spamReason}): ${String(name).slice(0, 40)}`);
    return res.json({ ok: true });
  }
  if (!(await recaptchaOk(recaptcha, req.ip))) {
    console.log(`🚫 reCAPTCHA failed: ${String(name).slice(0, 40)}`);
    return res.status(400).json({ error: 'Моля, потвърдете, че не сте робот' });
  }
  try {
    db.prepare('INSERT INTO inquiries (name, phone, email, subject, message) VALUES (?, ?, ?, ?, ?)')
      .run(name, phone, email || '', subject || '', message);
    console.log(`📬 Запитване от ${name} (${phone}): ${subject}`);
    if (mailer) {
      const contactHtml = `<div style="font-family:Arial,sans-serif;max-width:600px">
        <h2 style="background:#1a1a2e;color:#fff;padding:16px 20px;border-radius:8px;margin:0 0 20px">📬 Ново запитване за оферта</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="color:#666;padding:6px 0;width:100px">Имена:</td><td style="font-weight:700">${name}</td></tr>
          <tr><td style="color:#666;padding:6px 0">Телефон:</td><td style="font-weight:700">${phone}</td></tr>
          ${email ? `<tr><td style="color:#666;padding:6px 0">Имейл:</td><td>${email}</td></tr>` : ''}
          ${subject ? `<tr><td style="color:#666;padding:6px 0">Тема:</td><td>${subject}</td></tr>` : ''}
        </table>
        <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin-top:16px">
          <div style="font-size:12px;color:#666;margin-bottom:8px">СЪОБЩЕНИЕ:</div>
          <div style="font-size:15px;line-height:1.6">${message.replace(/\n/g,'<br>')}</div>
        </div>
      </div>`;
      const contactSubject = `📬 Запитване за оферта — ${name} (${phone})`;
      if (mailer === 'resend') {
        sendViaResend(contactSubject, contactHtml).catch(e => console.error('Contact email error:', e.message));
      } else {
        mailer.sendMail({ from: `"Геопласт Сайт" <${process.env.SMTP_USER}>`, to: NOTIFY_TO, subject: contactSubject, html: contactHtml })
          .catch(e => console.error('Contact email error:', e.message));
      }
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/inquiries', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM inquiries ORDER BY created_at DESC').all());
});

app.delete('/api/inquiries/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM inquiries WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── SUBSCRIBERS ──────────────────────────────────────────────────────────────
app.post('/api/subscribe', (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Невалиден имейл' });
  try {
    db.prepare('INSERT OR IGNORE INTO subscribers (email) VALUES (?)').run(email.toLowerCase().trim());
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/subscribers', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM subscribers ORDER BY created_at DESC').all());
});

// ── STATIC ───────────────────────────────────────────────────────────────────
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin', 'index.html')));
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, 'admin', req.path.replace('/admin/', '') || 'index.html')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🟢 Геопласт магазин: http://localhost:${PORT}`);
    console.log(`🔧 Администрация:    http://localhost:${PORT}/admin\n`);
  });
}).catch(err => {
  console.error('❌ Грешка при стартиране:', err);
  process.exit(1);
});
