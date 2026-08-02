// ── Cart ─────────────────────────────────────────────────────────────────────
const Cart = {
  key: 'geoplast_cart',
  get() { try { return JSON.parse(localStorage.getItem(this.key)) || []; } catch { return []; } },
  save(items) { localStorage.setItem(this.key, JSON.stringify(items)); Cart.updateHeader(); },
  count() { return this.get().reduce((s, i) => s + i.qty, 0); },
  total() { return this.get().reduce((s, i) => s + i.price * i.qty, 0); },

  add(product) {
    const items = this.get();
    const ex = items.find(i => i.id === product.id);
    if (ex) ex.qty += 1;
    else items.push({ id: product.id, name: product.name, price: product.price, image: product.image, code: product.code, qty: 1 });
    this.save(items);
    showToast(`✅ "${product.name.slice(0, 40)}..." добавен в количката`, 'success');
  },

  remove(id) {
    this.save(this.get().filter(i => i.id !== id));
  },

  updateQty(id, qty) {
    const items = this.get();
    const item = items.find(i => i.id === id);
    if (item) { item.qty = Math.max(1, parseInt(qty) || 1); this.save(items); }
  },

  clear() { localStorage.removeItem(this.key); this.updateHeader(); },

  updateHeader() {
    const el = document.getElementById('cart-count');
    if (el) {
      const n = this.count();
      el.textContent = n;
      el.style.display = n > 0 ? 'inline' : 'none';
    }
  }
};

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ── Product rendering ─────────────────────────────────────────────────────────
function productCard(p) {
  const badge = p.old_price ? `<div class="product-badge">-${Math.round((1 - p.price/p.old_price)*100)}%</div>` : '';
  const oldP  = p.old_price ? `<span class="price-old">${p.old_price.toFixed(2)} €</span>` : '';
  const imgEl = p.image
    ? `<img src="${p.image}" alt="${esc(p.name)}" loading="lazy" style="cursor:pointer" onclick="location.href='/product.html?id=${p.id}'">`
    : `<span onclick="location.href='/product.html?id=${p.id}'" style="cursor:pointer;font-size:52px">${getCatEmoji(p.category)}</span>`;
  const inCart = Cart.get().some(i => i.id === p.id);
  return `
    <div class="product-card" data-id="${p.id}">
      ${badge}
      <div class="delivery-badge">🚚 Безплатна доставка</div>
      <div class="product-img">${imgEl}</div>
      <div class="product-body">
        <div class="product-brand">Геопласт</div>
        <a href="/product.html?id=${p.id}" class="product-name" style="display:block;color:inherit">${esc(p.name)}</a>
        <div class="product-code">${p.code ? `Код: ${esc(p.code)}` : ''}</div>
        <div class="product-unit-note">Цена за бр. · Изпращаме на кашони</div>
        <div class="product-price">
          <span class="price-new">${p.price.toFixed(2)} €</span>
          ${oldP}
          <span class="price-lv">(${(p.price * 1.956).toFixed(2)} лв.)</span>
        </div>
        <button class="btn-buy ${inCart ? 'in-cart' : ''}" onclick="addToCart(${p.id})" data-pid="${p.id}">
          ${inCart ? '✅ В количката' : '🛒 Добави'}
        </button>
      </div>
    </div>`;
}

// ── Image lightbox ────────────────────────────────────────────────────────────
function openImgModal(src, name) {
  let m = document.getElementById('img-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'img-modal';
    m.className = 'img-modal';
    m.innerHTML = '<div class="img-modal-box"><button class="img-modal-close" onclick="closeImgModal()">✕</button><img id="img-modal-img" src="" alt=""><div id="img-modal-name"></div></div>';
    m.addEventListener('click', e => { if (e.target === m) closeImgModal(); });
    document.body.appendChild(m);
  }
  document.getElementById('img-modal-img').src = src;
  document.getElementById('img-modal-name').textContent = name;
  m.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeImgModal() {
  const m = document.getElementById('img-modal');
  if (m) m.classList.remove('show');
  document.body.style.overflow = '';
}

// ── Scroll to products ────────────────────────────────────────────────────────
function scrollToProducts() {
  const sec = document.getElementById('products-section');
  if (sec) setTimeout(() => sec.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

function getCatEmoji(cat) {
  const map = { 'dubeli-izolacia': '🔩', 'dubeli-kabelni': '🔗', 'fiksatori-armatura': '🔧', 'ogranicheteli': '🧱', 'klin-fugi': '📐' };
  return map[cat] || '📦';
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Load products ─────────────────────────────────────────────────────────────
async function loadProducts(params = {}) {
  const grid = document.getElementById('products-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="loading"><div class="spinner"></div><br>Зареждане...</div>';
  const qs = new URLSearchParams(params).toString();
  try {
    const res = await fetch(`/api/products${qs ? '?' + qs : ''}`);
    const products = await res.json();
    if (!products.length) {
      grid.innerHTML = '<div class="loading">Няма намерени продукти</div>';
      return;
    }
    grid.innerHTML = products.map(productCard).join('');
  } catch (e) {
    grid.innerHTML = '<div class="loading">Грешка при зареждане</div>';
  }
}

// ── Add to cart ───────────────────────────────────────────────────────────────
async function addToCart(id) {
  try {
    const res = await fetch(`/api/products/${id}`);
    const p = await res.json();
    Cart.add(p);
    // Update button state
    document.querySelectorAll(`[data-pid="${id}"]`).forEach(btn => {
      btn.className = 'btn-buy in-cart';
      btn.textContent = '✅ В количката';
    });
  } catch (e) {
    showToast('Грешка при добавяне', 'error');
  }
}

// ── Settings / Logo ───────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const s = await (await fetch('/api/settings')).json();
    const logoEl = document.getElementById('site-logo');
    if (logoEl && s.logo) {
      logoEl.innerHTML = `<img src="${s.logo}" alt="Геопласт лого">`;
    }
    const ann = document.getElementById('announcement-text');
    if (ann && s.announcement) ann.textContent = s.announcement;
    const p1 = document.getElementById('hdr-phone');
    if (p1 && s.phone1) { p1.textContent = s.phone1; p1.href = `tel:${s.phone1.replace(/\s/g, '')}`; }
    // Popup
    if (s.popup_title) {
      const pt = document.getElementById('popup-title');
      if (pt) pt.textContent = s.popup_title;
    }
    if (s.popup_text) {
      const pp = document.getElementById('popup-text');
      if (pp) pp.textContent = s.popup_text;
    }
    return s;
  } catch { return {}; }
}

// ── Email popup ───────────────────────────────────────────────────────────────
function initPopup() {
  if (sessionStorage.getItem('popup_shown')) return;
  setTimeout(() => {
    const overlay = document.getElementById('email-popup');
    if (overlay) {
      overlay.classList.add('show');
      sessionStorage.setItem('popup_shown', '1');
    }
  }, 5000);
}

function closePopup() {
  const overlay = document.getElementById('email-popup');
  if (overlay) overlay.classList.remove('show');
}

async function subscribePopup(e) {
  e.preventDefault();
  const input = document.getElementById('popup-email');
  const email = input?.value?.trim();
  if (!email) return;
  try {
    const res = await fetch('/api/subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    if (res.ok) {
      closePopup();
      showToast('✅ Успешно абонирани! Проверете имейла си.', 'success');
    }
  } catch { showToast('Грешка при абонамент', 'error'); }
}

// ── Category filter ───────────────────────────────────────────────────────────
let currentCategory = 'all';
let searchTimeout;

function filterByCategory(cat, linkEl) {
  currentCategory = cat;
  document.querySelectorAll('.cat-item > a, .cat-card').forEach(el => el.classList.remove('active'));
  if (linkEl) linkEl.classList.add('active');
  loadProducts({ category: cat === 'all' ? '' : cat });
  const sec = document.getElementById('products-section');
  if (sec) setTimeout(() => sec.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
}

function handleSearch(val) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    loadProducts({ search: val, category: currentCategory === 'all' ? '' : currentCategory });
  }, 350);
}

// ── getCatEmoji update ────────────────────────────────────────────────────────
function getCatEmoji(cat) {
  const map = {
    'dubeli-izolacia': '🔩',
    'dubeli-kabelni': '🔗',
    'fiksatori-armatura': '🔧',
    'ogranicheteli': '🧱',
    'klin-fugi': '📐',
    'samoniveliraschi': '📏',
  };
  return map[cat] || '📦';
}

// ── Fade-in on scroll ─────────────────────────────────────────────────────────
function initFadeIn() {
  const els = document.querySelectorAll('.fade-in');
  if (!els.length) return;
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.08 });
  els.forEach((el, i) => {
    el.style.transitionDelay = (i * 0.05) + 's';
    obs.observe(el);
  });
}

// ── Mobile categories panel ───────────────────────────────────────────────────
function initMobileCats() {
  const btn = document.getElementById('mobile-cats-btn');
  const panel = document.getElementById('mobile-cats-panel');
  if (!btn || !panel) return;
  btn.addEventListener('click', () => panel.classList.toggle('open'));
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  Cart.updateHeader();
  loadSettings();
  if (document.getElementById('products-grid')) {
    loadProducts();
  }
  initFadeIn();
  initMobileCats();
});
