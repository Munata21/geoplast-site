// sql.js adapter — mirrors better-sqlite3's synchronous API
// sql.js uses WebAssembly (no native compilation needed)
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'geoplast.db');
let _db; // sql.js Database instance

// ── Compatibility layer ───────────────────────────────────────────────────────
function toParams(args) {
  if (!args || !args.length) return [];
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return Array.from(args);
}

function rowify(result) {
  if (!result || !result.length || !result[0].values.length) return null;
  const { columns, values } = result[0];
  return values.map(row => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
}

class Statement {
  constructor(sql) { this._sql = sql; }

  run(...args) {
    _db.run(this._sql, toParams(args));
    save();
    const r = _db.exec('SELECT last_insert_rowid() as id');
    return { lastInsertRowid: r[0]?.values[0][0] || 0, changes: 1 };
  }

  get(...args) {
    const rows = rowify(_db.exec(this._sql, toParams(args)));
    return rows ? rows[0] : undefined;
  }

  all(...args) {
    return rowify(_db.exec(this._sql, toParams(args))) || [];
  }
}

function save() {
  fs.writeFileSync(DB_PATH, Buffer.from(_db.export()));
}

// Exported db object — same interface as better-sqlite3
const db = {
  prepare: (sql) => new Statement(sql),
  exec: (sql) => { _db.run(sql); save(); return db; },
  pragma: () => db,
};

// ── Init ──────────────────────────────────────────────────────────────────────
async function initDB() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    _db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    _db = new SQL.Database();
  }

  // Create tables
  _db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      old_price REAL,
      category TEXT NOT NULL DEFAULT 'general',
      code TEXT,
      stock INTEGER DEFAULT 0,
      unit TEXT DEFAULT 'бр.',
      image TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT,
      customer_address TEXT NOT NULL,
      customer_city TEXT NOT NULL,
      courier TEXT NOT NULL DEFAULT 'speedy',
      courier_city_id TEXT,
      courier_price REAL DEFAULT 0,
      payment_method TEXT DEFAULT 'cod',
      notes TEXT,
      status TEXT DEFAULT 'pending',
      tracking_number TEXT,
      products_total REAL NOT NULL,
      total REAL NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER REFERENCES orders(id),
      product_id INTEGER,
      product_name TEXT NOT NULL,
      price REAL NOT NULL,
      qty INTEGER NOT NULL
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT, phone TEXT, email TEXT, subject TEXT, message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS product_variations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER REFERENCES products(id),
      name TEXT NOT NULL,
      description TEXT,
      price_modifier REAL DEFAULT 0,
      stock INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0
    )
  `);

  save();

  // Default settings
  const defaults = [
    ['logo', '/images/geoplast_logo.png'],
    ['phone1', '0887 77 89 92'],
    ['email', 'geoplast.v.eood@gmail.com'],
    ['address', 'Варна, ЗПЗ, България'],
    ['popup_title', '10% отстъпка за нови клиенти!'],
    ['popup_text', 'Абонирайте се и получете 10% отстъпка от първата поръчка.'],
    ['announcement', '🚚 Безплатна доставка в цялата страна | ✅ Сертифицирани продукти | 🏭 Директно от производителя | 📞 0887 77 89 92'],
  ];
  for (const [k, v] of defaults) {
    _db.run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', [k, v]);
  }

  // Seed products if empty
  const count = (_db.exec('SELECT COUNT(*) as c FROM products')[0]?.values[0][0]) || 0;
  if (count === 0) {
    const ins = [
      ['ДЮБЕЛИ ЗА ТОПЛОИЗОЛАЦИЯ С ПОЛИАМИДЕН ПИРОН', '', 17.04, null, 'dubeli-izolacia', 'GP-TI-POL', 500, 'бр.', '/images/products/wp_1158.png'],
      ['Дюбел за бетон с голяма периферия за високи натоварвания', '', 106.02, null, 'dubeli-izolacia', 'GP-BET-PER', 200, 'бр.', '/images/products/wp_1159.png'],
      ['Дюбел за вата', '', 53.69, null, 'dubeli-izolacia', 'GP-DV-MET', 500, 'бр.', '/images/products/wp_1777.jpeg'],
      ['Дюбел за тухла', '', 24.19, null, 'dubeli-izolacia', 'GP-DT-TER', 500, 'бр.', '/images/products/wp_1775.png'],
      ['Дюбел за Бетон', '', 41.23, null, 'dubeli-izolacia', 'GP-DB-TER', 500, 'бр.', '/images/products/wp_1759.png'],
      ['Дюбел за кабелни връзки', '', 49.05, null, 'dubeli-kabelni', 'GP-DKV-PVC', 400, 'бр.', '/images/products/wp_865.jpg'],
      ['Фиксатор за арматура – колонен', '', 32.52, null, 'fiksatori-armatura', 'GP-FA-KOL', 299, 'бр.', '/images/products/wp_870.jpg'],
      ['3D Ограничители за керамични изделия', '', 24.11, null, 'ogranicheteli', 'GP-3D-OGR', 400, 'бр.', '/images/products/wp_1769.png'],
      ['Ограничители за керамични изделия', '', 17.79, null, 'ogranicheteli', 'GP-OGR-KER', 600, 'бр.', '/images/products/wp_871.jpg'],
      ['Клин за фуги', '', 30.68, null, 'klin-fugi', 'GP-KF-STD', 400, 'бр.', '/images/products/wp_1162.png'],
      ['Клещи за самонивелиращи системи', '', 10.23, null, 'samoniveliraschi', 'GP-KL-SNS', 100, 'бр.', '/images/products/wp_1770.png'],
      ['Самонивелираща система за плочки – затягаща гайка с винт', '', 20.71, null, 'samoniveliraschi', 'GP-SNS-GV', 300, 'бр.', '/images/products/wp_1754.png'],
      ['Самонивелираща система за плочки с клин', '', 13.75, null, 'samoniveliraschi', 'GP-SNS-KL', 300, 'бр.', '/images/products/wp_1751.jpg'],
    ];
    for (const r of ins) {
      _db.run('INSERT INTO products (name, description, price, old_price, category, code, stock, unit, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', r);
    }
  }

  // Backfill images for products seeded without image paths
  const imageMap = [
    ['GP-TI-POL',  '/images/products/wp_1158.png'],
    ['GP-BET-PER', '/images/products/wp_1159.png'],
    ['GP-DV-MET',  '/images/products/wp_1777.jpeg'],
    ['GP-DT-TER',  '/images/products/wp_1775.png'],
    ['GP-DB-TER',  '/images/products/wp_1759.png'],
    ['GP-DKV-PVC', '/images/products/wp_865.jpg'],
    ['GP-FA-KOL',  '/images/products/wp_870.jpg'],
    ['GP-3D-OGR',  '/images/products/wp_1769.png'],
    ['GP-OGR-KER', '/images/products/wp_871.jpg'],
    ['GP-KF-STD',  '/images/products/wp_1162.png'],
    ['GP-KL-SNS',  '/images/products/wp_1770.png'],
    ['GP-SNS-GV',  '/images/products/wp_1754.png'],
    ['GP-SNS-KL',  '/images/products/wp_1751.jpg'],
  ];
  for (const [code, img] of imageMap) {
    _db.run('UPDATE products SET image = ? WHERE code = ? AND image IS NULL', [img, code]);
  }

  // Update product descriptions from old WordPress site scraping
  const descMap = [
    ['GP-DB-TER',  'За захващане в бетон на различни видове термоизолации'],
    ['GP-FA-KOL',  'За захващане на различни видове арматура'],
  ];
  for (const [code, desc] of descMap) {
    _db.run('UPDATE products SET description = ? WHERE code = ? AND (description IS NULL OR description = ?)', [desc, code, '']);
  }

  // Seed product variations if none exist
  const varCount = (_db.exec('SELECT COUNT(*) as c FROM product_variations')[0]?.values[0][0]) || 0;
  if (varCount === 0) {
    const insVar = (code, variations) => {
      const row = _db.exec(`SELECT id FROM products WHERE code = '${code}'`)[0];
      if (!row || !row.values.length) return;
      const pid = row.values[0][0];
      variations.forEach(([name, desc, sort]) => {
        _db.run('INSERT INTO product_variations (product_id, name, description, sort_order) VALUES (?, ?, ?, ?)',
          [pid, name, desc, sort]);
      });
    };

    // Дюбели за Бетон — 6 размера
    insVar('GP-DB-TER', [
      ['8×50мм',  '2000 бр./кашон (пакети по 100 бр.)', 1],
      ['8×70мм',  '1600 бр./кашон (пакети по 100 бр.)', 2],
      ['8×90мм',  '1200 бр./кашон (пакети по 100 бр.)', 3],
      ['8×110мм', '1200 бр./кашон (пакети по 100 бр.)', 4],
      ['8×130мм', '1000 бр./кашон (пакети по 100 бр.)', 5],
      ['8×150мм', '1000 бр./кашон (пакети по 100 бр.)', 6],
    ]);

    // Дюбел за кабелни връзки
    insVar('GP-DKV-PVC', [
      ['8×40мм', '15 т./кашон (пакети по 100 бр.)', 1],
    ]);

    // Фиксатор за арматура — колонен
    insVar('GP-FA-KOL', [
      ['R15', '1000 бр./кашон (пакети по 100 бр.)', 1],
      ['R20', '1000 бр./кашон (пакети по 100 бр.)', 2],
    ]);

    // Ограничители за керамични изделия
    insVar('GP-OGR-KER', [
      ['2мм', '200 бр./пакет · 50 пакета/кашон', 1],
      ['3мм', '150 бр./пакет · 50 пакета/кашон', 2],
      ['4мм', '100 бр./пакет · 50 пакета/кашон', 3],
      ['5мм', '100 бр./пакет · 50 пакета/кашон', 4],
    ]);

    // Клин за фуги
    insVar('GP-KF-STD', [
      ['6мм', '100 бр. · 50 пакета/кашон', 1],
      ['8мм', '50 бр. · 50 пакета/кашон',  2],
    ]);
  }

  save();
  console.log('✅ База данни инициализирана');
}

module.exports = { db, initDB };
