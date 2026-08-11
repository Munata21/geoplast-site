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
      ['ДЮБЕЛИ ЗА  БЕТОН', '', 46.08, null, 'dubeli-izolacia', 'GP-TI-POL', 500, 'кутия', '/images/products/wp_1158.png'],
      ['ДЮБЕЛИ ЗА   ТУХЛА С ПЛАСТМАСОВ ПИРОН', '', 24.2, null, 'dubeli-izolacia', 'GP-BET-PER', 200, 'кутия', '/images/products/wp_1159.png'],
      ['Дюбел за вата', '', 24, null, 'dubeli-izolacia', 'GP-DV-MET', 500, 'бр.', '/images/products/wp_1777.jpeg'],
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

  // Master product data — applied on EVERY startup so deploys never lose correct data
  // [code, name, image, description]
  const masterData = [
    ['GP-TI-POL',  'ДЮБЕЛИ ЗА  БЕТОН',
     '/images/products/wp_1158.png',
     'Пластмасовите дюбели за топлоизолация са предназначени за механично закрепване на топлоизолационни плоскости от експандиран и екструдиран пенополистирол. В зависимост от вида на основата, в която ще бъдат монтирани, дюбелите за топлоизолация се разделят основно на два вида – дюбели за тухла – с пластмасов пирон и дюбели за бетон.\r\nДюбелите за бетон служат за допълнително захващане на топлоизолационни плоскости към бетонни, стоманобетонни и други монолитни основи. Основата трябва да бъде предварително подготвена като за целта се пробиват дупки, в които след това се набиват дюбелите. Препоръчва се дюбелиране с не по-малко от 3 дюбела на лист.\r\nДължината на дюбелите, които ще се използват, се определя от дебелината на топлоизолационния слой. '],
    ['GP-BET-PER', 'ДЮБЕЛИ ЗА   ТУХЛА С ПЛАСТМАСОВ ПИРОН',
     '/images/products/wp_1159.png',
     'Пластмасовите дюбели за топлоизолация са предназначени за механично закрепване на топлоизолационни плоскости от експандиран и екструдиран пенополистирол. В зависимост от вида на основата, в която ще бъдат монтирани, дюбелите за топлоизолация се разделят основно на два вида дюбели за тухла – с пластмасов пирон и дюбели за бетон. Дюбелите с пирон служат за допълнително захващане на топлоизолационни плоскости към тухлени, газобетонни и други зидарии.\r\nДюбелирането на топлоизолацията започва с пробиването на дупки на точно определени места и съобразени с размерите на дюбелите. Те трябва да влязат в основата най-малко 5 см с цел да захванат максимално здраво към нея. Трябва да бъдат предвидени дюбели навсякъде, където се засичат три отделни листа от изолацията, както и в средата на всеки лист. Препоръчва се закрепване с не по-малко от 3 дюбела на лист, като дължината им се определя от дебелината на топлоизолационния слой.'],
    ['GP-DV-MET',  'Дюбел за вата',                                                         '/images/products/wp_1777.jpeg', 'За захващане на минерална вата и меки изолационни материали към различни основи.'],
    ['GP-DT-TER',  'Дюбел за тухла',                                                        '/images/products/wp_1775.png',  'За захващане в тухла на различни видове термоизолации.'],
    ['GP-DB-TER',  'Дюбел за Бетон',                                                        '/images/products/wp_1759.png',  'За захващане в бетон на различни видове термоизолации.'],
    ['GP-DKV-PVC', 'Дюбел за кабелни връзки',                                               '/images/products/wp_865.jpg',   'За монтаж и закрепване на кабели и проводници към стени и тавани.'],
    ['GP-FA-KOL',  'Фиксатор за арматура – колонен',                                        '/images/products/wp_870.jpg',   'За захващане на различни видове арматура.'],
    ['GP-3D-OGR',  '3D Ограничители за керамични изделия',                                  '/images/products/wp_1769.png',  'Триизмерен ограничител за прецизно нивелиране на керамични изделия.'],
    ['GP-OGR-KER', 'Ограничители за керамични изделия',                                     '/images/products/wp_871.jpg',   'За поддържане на равномерно разстояние между керамични плочки при полагане.'],
    ['GP-KF-STD',  'Клин за фуги',                                                          '/images/products/wp_1162.png',  'За нивелиране и уравновесяване на плочки при монтаж. Многократно използваем.'],
    ['GP-KL-SNS',  'Клещи за самонивелиращи системи',                                       '/images/products/wp_1770.png',  'Клещи за затягане на фиксиращите елементи на самонивелиращата система за плочки.'],
    ['GP-SNS-GV',  'Самонивелираща система за плочки – затягаща гайка с винт',              '/images/products/wp_1754.png',  'Самонивелираща система с гайка и винт — за перфектно ниво на подовата и стенна облицовка.'],
    ['GP-SNS-KL',  'Самонивелираща система за плочки с клин',                               '/images/products/wp_1751.jpg',  'Самонивелираща система с клин — бърз монтаж на плочки без неравности и хлабини.'],
  ];
  for (const [code, name, img, desc] of masterData) {
    _db.run('UPDATE products SET name = ?, image = ?, description = ? WHERE code = ?', [name, img, desc, code]);
  }

  // Seed product variations if none exist
  const varCount = (_db.exec('SELECT COUNT(*) as c FROM product_variations')[0]?.values[0][0]) || 0;
  if (varCount === 0) {
    // [name, desc, sort_order, price_modifier]
    const insVar = (code, variations) => {
      const row = _db.exec(`SELECT id FROM products WHERE code = '${code}'`)[0];
      if (!row || !row.values.length) return;
      const pid = row.values[0][0];
      variations.forEach(([name, desc, sort, pricemod = 0]) => {
        _db.run('INSERT INTO product_variations (product_id, name, description, sort_order, price_modifier) VALUES (?, ?, ?, ?, ?)',
          [pid, name, desc, sort, pricemod]);
      });
    };

    // ДЮБЕЛИ ЗА БЕТОН (GP-TI-POL) — 6 размера
    insVar('GP-TI-POL', [
      ['8х50мм',  '2000 бр./кашон (пакети по 100 бр.)', 1,  7.6],
      ['8х70мм',  '1600 бр./кашон (пакети по 100 бр.)', 2, -2],
      ['8х90мм',  '1200 бр./кашон (пакети по 100 бр.)', 3, -3.92],
      ['8х110мм', '1200 бр./кашон (пакети по 100 бр.)', 4,  0.4],
      ['8х130мм', '1000 бр./кашон (пакети по 100 бр.)', 5, -0.8],
      ['8х150мм', '1000 бр./кашон (пакети по 100 бр.)', 6, 14.8],
    ]);

    // ДЮБЕЛИ ЗА ТУХЛА С ПЛАСТМАСОВ ПИРОН (GP-BET-PER) — 5 размера
    insVar('GP-BET-PER', [
      ['10х100мм', '1000 бр./кашон (пакети по 100 бр.)', 1,  0],
      ['10х120мм', '800 бр./кашон (пакети по 100 бр.)',  2,  3.02],
      ['10х140мм', '600 бр./кашон (пакети по 100 бр.)',  3, 16.12],
      ['10х160мм', '600 бр./кашон (пакети по 100 бр.)',  4,  6.04],
      ['10х200мм', '400 бр./кашон (пакети по 100 бр.)',  5, 31],
    ]);

    // Дюбел за вата (GP-DV-MET)
    insVar('GP-DV-MET', [
      ['10х140мм', '2000 бр./кашон', 1, 0],
    ]);

    // Дюбели за Бетон — 6 размера
    insVar('GP-DB-TER', [
      ['8×50мм',  '2000 бр./кашон (пакети по 100 бр.)', 1, 0],
      ['8×70мм',  '1600 бр./кашон (пакети по 100 бр.)', 2, 0],
      ['8×90мм',  '1200 бр./кашон (пакети по 100 бр.)', 3, 0],
      ['8×110мм', '1200 бр./кашон (пакети по 100 бр.)', 4, 0],
      ['8×130мм', '1000 бр./кашон (пакети по 100 бр.)', 5, 0],
      ['8×150мм', '1000 бр./кашон (пакети по 100 бр.)', 6, 0],
    ]);

    // Дюбел за кабелни връзки
    insVar('GP-DKV-PVC', [
      ['8×40мм', '15 т./кашон (пакети по 100 бр.)', 1, 0],
    ]);

    // Фиксатор за арматура — колонен (3 размера)
    insVar('GP-FA-KOL', [
      ['R15', '1000 бр./кашон (пакети по 100 бр.)', 1, 0],
      ['R20', '1000 бр./кашон (пакети по 100 бр.)', 2, 0],
      ['R25', '1000 бр./кашон (пакети по 100 бр.)', 3, 0],
    ]);

    // Ограничители за керамични изделия
    insVar('GP-OGR-KER', [
      ['2мм', '200 бр./пакет · 50 пакета/кашон', 1, 0],
      ['3мм', '150 бр./пакет · 50 пакета/кашон', 2, 0],
      ['4мм', '100 бр./пакет · 50 пакета/кашон', 3, 0],
      ['5мм', '100 бр./пакет · 50 пакета/кашон', 4, 0],
    ]);

    // Клин за фуги
    insVar('GP-KF-STD', [
      ['6мм', '100 бр. · 50 пакета/кашон', 1, 0],
      ['8мм', '50 бр. · 50 пакета/кашон',  2, 0],
    ]);
  }

  // Ensure correct units per product code (explicit, safe to re-run)
  const unitMap = [
    ['GP-TI-POL', 'кутия'], ['GP-BET-PER', 'кутия'],
    ['GP-DV-MET', 'бр.'],   ['GP-DT-TER',  'кашон'],
    ['GP-DB-TER', 'кашон'], ['GP-DKV-PVC', 'кашон'],
    ['GP-FA-KOL', 'кашон'], ['GP-3D-OGR',  'кашон'],
    ['GP-OGR-KER','кашон'], ['GP-KF-STD',  'кашон'],
    ['GP-KL-SNS', 'бр.'],   ['GP-SNS-GV',  'кашон'],
    ['GP-SNS-KL', 'кашон'],
  ];
  for (const [code, unit] of unitMap) {
    _db.run(`UPDATE products SET unit = '${unit}' WHERE code = '${code}'`);
  }

  // One-time: restore missing variations for GP-TI-POL, GP-BET-PER, GP-DV-MET
  const restoreVarsDone = _db.exec(`SELECT value FROM settings WHERE key='migration_restore_vars_v1'`);
  if (!restoreVarsDone.length || !restoreVarsDone[0].values.length) {
    const ensureVars = (code, variations) => {
      const row = _db.exec(`SELECT id FROM products WHERE code = '${code}'`)[0];
      if (!row?.values?.length) return;
      const pid = row.values[0][0];
      const cnt = (_db.exec(`SELECT COUNT(*) FROM product_variations WHERE product_id = ${pid}`)[0]?.values[0][0]) || 0;
      if (cnt === 0) {
        variations.forEach(([name, desc, sort, mod]) => {
          _db.run('INSERT INTO product_variations (product_id, name, description, sort_order, price_modifier) VALUES (?, ?, ?, ?, ?)',
            [pid, name, desc, sort, mod]);
        });
      }
    };
    ensureVars('GP-TI-POL', [
      ['8х50мм',  '2000 бр./кашон (пакети по 100 бр.)', 1,  7.6],
      ['8х70мм',  '1600 бр./кашон (пакети по 100 бр.)', 2, -2],
      ['8х90мм',  '1200 бр./кашон (пакети по 100 бр.)', 3, -3.92],
      ['8х110мм', '1200 бр./кашон (пакети по 100 бр.)', 4,  0.4],
      ['8х130мм', '1000 бр./кашон (пакети по 100 бр.)', 5, -0.8],
      ['8х150мм', '1000 бр./кашон (пакети по 100 бр.)', 6, 14.8],
    ]);
    ensureVars('GP-BET-PER', [
      ['10х100мм', '1000 бр./кашон (пакети по 100 бр.)', 1,  0],
      ['10х120мм', '800 бр./кашон (пакети по 100 бр.)',  2,  3.02],
      ['10х140мм', '600 бр./кашон (пакети по 100 бр.)',  3, 16.12],
      ['10х160мм', '600 бр./кашон (пакети по 100 бр.)',  4,  6.04],
      ['10х200мм', '400 бр./кашон (пакети по 100 бр.)',  5, 31],
    ]);
    ensureVars('GP-DV-MET', [
      ['10х140мм', '2000 бр./кашон', 1, 0],
    ]);
    _db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('migration_restore_vars_v1', 'done')`);
  }

  // One-time: fix broken negative price_modifier on GP-DV-MET variation
  const varFixDone = _db.exec(`SELECT value FROM settings WHERE key='migration_var_fix_v1'`);
  if (!varFixDone.length || !varFixDone[0].values.length) {
    const dvRow = _db.exec(`SELECT id FROM products WHERE code = 'GP-DV-MET'`)[0];
    if (dvRow?.values?.length) {
      const dvId = dvRow.values[0][0];
      _db.run(`UPDATE product_variations SET price_modifier = 0 WHERE product_id = ${dvId} AND price_modifier < 0`);
    }
    _db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('migration_var_fix_v1', 'done')`);
  }

  // Migration: add R25 variation to GP-FA-KOL if only 2 exist
  const fakolRow = _db.exec(`SELECT id FROM products WHERE code = 'GP-FA-KOL'`)[0];
  if (fakolRow?.values?.length) {
    const fakolId = fakolRow.values[0][0];
    const fakolVars = (_db.exec(`SELECT COUNT(*) FROM product_variations WHERE product_id = ${fakolId}`)[0]?.values[0][0]) || 0;
    if (fakolVars === 2) {
      _db.run('INSERT INTO product_variations (product_id, name, description, sort_order, price_modifier) VALUES (?, ?, ?, ?, ?)',
        [fakolId, 'R25', '1000 бр./кашон (пакети по 100 бр.)', 3, 0]);
    }
  }

  save();
  console.log('✅ База данни инициализирана');
}

module.exports = { db, initDB };
