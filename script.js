/* ========================================
   出数管理表 — TRPGポータル応用
   ======================================== */

const STATUS_LABELS = {
  pending: '未着手',
  in_progress: '製作中',
  done: '完了',
  cancelled: 'キャンセル'
};

const STATUS_CLASSES = {
  pending: 'status-pending',
  in_progress: 'status-in_progress',
  done: 'status-done',
  cancelled: 'status-cancelled'
};

const store = {
  orders: [],
  clients: [],
  products: []
};

const indexes = {
  orderById: new Map(),
  clientById: new Map(),
  productById: new Map(),
  ordersByClientId: new Map(),
  ordersByProductId: new Map()
};

let route = { section: 'orders', id: null };
let loadMeta = { orderSource: '', notices: [] };

const contentArea = document.getElementById('contentArea');
const globalSearch = document.getElementById('globalSearch');
const navMenu = document.getElementById('navMenu');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const menuToggle = document.getElementById('menuToggle');
const sidebarClose = document.getElementById('sidebarClose');

const SITE_NAME = '出数表入力';
const SITE_BANNER = '食堂出数入力';

const MENU_CATEGORIES = {
  daily: '日替わりメニュー',
  health: '健康',
  recommend: 'おすすめ',
  noodle: '麺ランチ',
  budget: 'おてごろ'
};

const OTHER_MENU_KEYS = ['health', 'recommend', 'noodle', 'budget'];

let homeState = {
  selectedDate: '',
  selectedCategory: 'daily',
  menuOpen: false,
  searchQuery: ''
};

async function loadData() {
  const { data, indexes: built, meta } = await window.loadOutputData();
  store.orders = data.orders;
  store.clients = data.clients;
  store.products = data.products;

  indexes.orderById = built.orderById;
  indexes.clientById = built.clientById;
  indexes.productById = built.productById;
  indexes.ordersByClientId = built.ordersByClientId;
  indexes.ordersByProductId = built.ordersByProductId;

  loadMeta = meta || { orderSource: '', notices: [] };
}

function resolveClient(id) {
  return id ? indexes.clientById.get(id) : null;
}

function resolveProduct(id) {
  return id ? indexes.productById.get(id) : null;
}

function ordersForClient(clientId) {
  return indexes.ordersByClientId.get(clientId) || [];
}

function ordersForProduct(productId) {
  return indexes.ordersByProductId.get(productId) || [];
}

function parseHash() {
  const hash = location.hash.slice(1) || 'home';
  const parts = hash.split('/').filter(Boolean);
  return { section: parts[0] || 'home', id: parts[1] || null };
}

function navigate(section, id) {
  const hash = id ? `#${section}/${id}` : `#${section}`;
  if (location.hash !== hash) {
    location.hash = hash;
  } else {
    route = { section, id };
    render();
  }
}

function onHashChange() {
  route = parseHash();
  updateNavActive();
  render();
  renderNoticeBanner();
  scrollDetailToTop();
}

function updateNavActive() {
  navMenu.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.section === route.section);
  });
}

function scrollDetailToTop() {
  const panel = contentArea.querySelector('.detail-panel');
  if (panel) panel.scrollTop = 0;
}

function updateDocumentTitle() {
  const entity = getActiveEntity();
  document.title = entity ? `${entity.name || entity.title} — ${SITE_NAME}` : SITE_NAME;
}

function getActiveEntity() {
  if (!route.id) return null;
  switch (route.section) {
    case 'orders': return indexes.orderById.get(route.id);
    case 'clients': return indexes.clientById.get(route.id);
    case 'products': return indexes.productById.get(route.id);
    default: return null;
  }
}

function renderLoadingScreen() {
  contentArea.innerHTML = `
    <div class="portal-loading" role="status" aria-live="polite">
      <span class="portal-loading-icon" aria-hidden="true">📋</span>
      <p class="portal-loading-brand">${SITE_NAME}</p>
      <p class="portal-loading-message">データを読み込んでいます…</p>
      <div class="portal-loading-bar" aria-hidden="true"><span></span></div>
    </div>
  `;
}

function getSearchQuery() {
  return globalSearch.value.toLowerCase().trim();
}

function matchesQuery(text, query) {
  return !query || (text || '').toLowerCase().includes(query);
}

function filterOrders(query) {
  return store.orders.filter(order => {
    const client = resolveClient(order.clientId);
    return matchesQuery(order.title, query) ||
      matchesQuery(order.orderNo, query) ||
      matchesQuery(order.productName, query) ||
      matchesQuery(order.assignee, query) ||
      matchesQuery(client?.name, query);
  });
}

function filterClients(query) {
  return store.clients.filter(client =>
    matchesQuery(client.name, query) ||
    matchesQuery(client.contact, query)
  );
}

function filterProducts(query) {
  return store.products.filter(product =>
    matchesQuery(product.name, query) ||
    matchesQuery(product.category, query)
  );
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function isPresent(value) {
  if (value == null) return false;
  if (typeof value === 'string') {
    const t = value.trim();
    return t !== '' && t !== '—' && t !== 'なし';
  }
  return Boolean(value);
}

function renderEmpty(message = 'なし') {
  return `<p class="empty-note">${message}</p>`;
}

function renderLink(href, label, sub = '') {
  return `<a href="${href}" class="entity-link">${escapeHtml(label)}${sub ? `<span class="link-sub">${escapeHtml(sub)}</span>` : ''}</a>`;
}

function renderLinkList(items) {
  if (!items.length) return renderEmpty();
  return `<ul class="link-list">${items.map(item => `<li>${item}</li>`).join('')}</ul>`;
}

function renderListLayout(listHtml, detailHtml) {
  return `
    <div class="list-panel">${listHtml}</div>
    <div class="detail-panel">${detailHtml}</div>
  `;
}

function renderDetailSection(heading, bodyHtml, { alwaysShow = false } = {}) {
  const hasBody = bodyHtml && String(bodyHtml).trim();
  if (!hasBody && !alwaysShow) return '';
  const inner = hasBody ? bodyHtml : renderEmpty();
  return `
    <section class="detail-section">
      <h2 class="section-heading">${escapeHtml(heading)}</h2>
      ${inner}
    </section>
  `;
}

function renderInfoRow(label, valueHtml) {
  if (!isPresent(valueHtml)) return '';
  return `<div class="info-row"><dt>${escapeHtml(label)}</dt><dd>${valueHtml}</dd></div>`;
}

function bindNavigation() {
  contentArea.querySelectorAll('[data-nav-section]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigate(el.dataset.navSection, el.dataset.navId);
      closeSidebar();
    });
  });
}

function getActiveId(filtered, fallbackId) {
  if (route.id && filtered.some(item => item.id === route.id)) {
    return route.id;
  }
  if (route.id && filtered.length > 0) {
    return filtered[0].id;
  }
  return fallbackId || filtered[0]?.id || null;
}

function formatQuantity(quantity, unit) {
  return `${Number(quantity).toLocaleString('ja-JP')} ${escapeHtml(unit || '部')}`;
}

function parseDueDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDueDate(value) {
  const d = parseDueDate(value);
  if (!d) return '—';
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function dueDateClass(value, status) {
  if (status === 'done' || status === 'cancelled') return '';
  const d = parseDueDate(value);
  if (!d) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(d);
  due.setHours(0, 0, 0, 0);
  if (due < today) return 'due-date--overdue';
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 7);
  if (due <= soon) return 'due-date--soon';
  return '';
}

function renderStatusBadge(status) {
  return `<span class="badge ${STATUS_CLASSES[status] || ''}">${STATUS_LABELS[status] || status}</span>`;
}

function sumQuantity(orders) {
  return orders.reduce((sum, order) => sum + (order.quantity || 0), 0);
}

function toDateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function initHomeState() {
  if (!homeState.selectedDate) {
    homeState.selectedDate = toDateInputValue(new Date());
  }
}

function getHomeOrders() {
  initHomeState();
  const query = homeState.searchQuery.toLowerCase().trim();
  return store.orders.filter(order => {
    const dateMatch = order.menuDate === homeState.selectedDate;
    const catMatch = order.category === homeState.selectedCategory;
    const searchMatch = !query || order.title.toLowerCase().includes(query);
    return dateMatch && catMatch && searchMatch;
  });
}

function renderHomeMenuListItems(orders) {
  if (!orders.length) {
    return `<li class="home-menu-empty">${renderEmpty('この日のメニューはありません')}</li>`;
  }
  return orders.map(order => `
    <li class="home-menu-item" data-nav-section="orders" data-nav-id="${order.id}">
      <span class="home-menu-item-name">${escapeHtml(order.title)}</span>
      <span class="home-menu-item-qty">${formatQuantity(order.quantity, order.unit)}</span>
    </li>
  `).join('');
}

function renderHomeMenuListHtml() {
  return renderHomeMenuListItems(getHomeOrders());
}

function renderHomeSummaryText() {
  const orders = getHomeOrders();
  const label = MENU_CATEGORIES[homeState.selectedCategory] || '日替わりメニュー';
  if (!orders.length) return `${label} — 0 件`;
  return `${label} — ${orders.length} 件 / 合計 ${sumQuantity(orders).toLocaleString('ja-JP')} 食`;
}

function bindHomeControls() {
  const dateInput = document.getElementById('homeDate');
  const menuToggle = document.getElementById('homeMenuToggle');
  const searchInput = document.getElementById('homeSearch');
  const dailyReset = document.getElementById('homeDailyReset');

  dateInput?.addEventListener('change', e => {
    homeState.selectedDate = e.target.value;
    renderHomeView();
  });

  menuToggle?.addEventListener('click', () => {
    homeState.menuOpen = !homeState.menuOpen;
    renderHomeView();
  });

  dailyReset?.addEventListener('click', () => {
    homeState.selectedCategory = 'daily';
    homeState.menuOpen = false;
    renderHomeView();
  });

  contentArea.querySelectorAll('[data-home-category]').forEach(btn => {
    btn.addEventListener('click', () => {
      homeState.selectedCategory = btn.dataset.homeCategory;
      homeState.menuOpen = false;
      renderHomeView();
    });
  });

  searchInput?.addEventListener('input', e => {
    homeState.searchQuery = e.target.value;
    const listEl = document.getElementById('homeMenuList');
    const summaryEl = document.getElementById('homeMenuSummary');
    if (listEl) listEl.innerHTML = renderHomeMenuListHtml();
    if (summaryEl) summaryEl.textContent = renderHomeSummaryText();
  });
}

function renderHomeView() {
  initHomeState();
  document.body.classList.add('view-home');

  const formUrl = (window.AppLinks || {}).orderForm || '#';
  const formReady = formUrl && formUrl !== '#';
  const categoryLabel = MENU_CATEGORIES[homeState.selectedCategory] || '日替わりメニュー';
  const orders = getHomeOrders();

  const formButton = formReady
    ? `<a href="${escapeAttr(formUrl)}" class="home-input-btn" target="_blank" rel="noopener noreferrer">入力</a>`
    : `<span class="home-input-btn home-input-btn--disabled" title="js/links.js にフォームURLを設定してください">入力</span>`;

  contentArea.innerHTML = `
    <div class="home-page">
      <header class="home-header">
        <div class="home-banner">
          <h1 class="home-banner-title">${escapeHtml(SITE_BANNER)}</h1>
          <img src="images/shokudo-logo.svg" alt="" class="home-banner-logo" width="56" height="56" decoding="async">
        </div>
        <p class="home-subtitle">${escapeHtml(SITE_NAME)}</p>
        <div class="home-search-row">
          <svg class="home-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
          <input type="search" id="homeSearch" class="home-search-input" placeholder="メニューを検索..." value="${escapeAttr(homeState.searchQuery)}" aria-label="メニュー検索">
        </div>
        ${formButton}
      </header>

      <section class="home-controls">
        <div class="home-date-row">
          <label class="home-field-label" for="homeDate">日付</label>
          <input type="date" id="homeDate" class="home-date-input" value="${escapeAttr(homeState.selectedDate)}">
        </div>

        <div class="home-menu-row">
          <span class="home-field-label">メニュー</span>
          <button type="button" id="homeMenuToggle" class="home-menu-toggle" aria-expanded="${homeState.menuOpen}">
            <span class="home-menu-toggle-label">${escapeHtml(categoryLabel)}</span>
            <span class="home-menu-caret" aria-hidden="true">▼</span>
          </button>
          ${homeState.selectedCategory !== 'daily' ? `
            <button type="button" id="homeDailyReset" class="home-daily-reset">日替わりに戻す</button>
          ` : ''}
        </div>

        ${homeState.menuOpen ? `
          <div class="home-category-list" role="list">
            ${OTHER_MENU_KEYS.map(key => `
              <button type="button" class="home-category-btn ${homeState.selectedCategory === key ? 'is-active' : ''}" data-home-category="${key}">
                ${escapeHtml(MENU_CATEGORIES[key])}
              </button>
            `).join('')}
          </div>
        ` : ''}

        <div class="home-menu-panel">
          <p id="homeMenuSummary" class="home-menu-summary">${escapeHtml(renderHomeSummaryText())}</p>
          <ul id="homeMenuList" class="home-menu-list">
            ${renderHomeMenuListItems(orders)}
          </ul>
        </div>
      </section>
    </div>
  `;

  bindHomeControls();
  bindNavigation();
}

function renderOrderListItem(order, active) {
  const client = resolveClient(order.clientId);
  return `
    <li class="list-item ${active ? 'active' : ''}"
        data-nav-section="orders"
        data-nav-id="${order.id}"
        role="option"
        aria-selected="${active}">
      <span class="list-icon">📦</span>
      <div class="list-item-info">
        <div class="list-item-name">${escapeHtml(order.title)}</div>
        <div class="list-item-sub">${escapeHtml(order.orderNo || '')} · ${escapeHtml(client?.name || '—')}</div>
      </div>
      <span class="list-item-qty">${Number(order.quantity).toLocaleString('ja-JP')}${escapeHtml(order.unit)}</span>
      <span class="list-item-badge ${STATUS_CLASSES[order.status]}">${STATUS_LABELS[order.status]}</span>
    </li>
  `;
}

function renderOrderDetail(order) {
  const client = resolveClient(order.clientId);
  const product = resolveProduct(order.productId);

  const headerRows = [
    renderInfoRow('管理番号', escapeHtml(order.orderNo || '—')),
    renderInfoRow('取引先', client
      ? renderLink(`#clients/${client.id}`, client.name)
      : escapeHtml('—')),
    renderInfoRow('品目', product
      ? renderLink(`#products/${product.id}`, product.name, product.category)
      : escapeHtml(order.productName || '—')),
    renderInfoRow('品名', escapeHtml(order.productName || product?.name || '—')),
    renderInfoRow('出数', `<span class="quantity-highlight">${formatQuantity(order.quantity, order.unit)}</span>`),
    renderInfoRow('納期', `<span class="${dueDateClass(order.dueDate, order.status)}">${formatDueDate(order.dueDate)}</span>`),
    renderInfoRow('担当', escapeHtml(order.assignee || '—')),
    renderInfoRow('状態', renderStatusBadge(order.status))
  ].filter(Boolean).join('');

  return `
    <article class="entity-detail">
      <header class="detail-header detail-header--compact">
        <span class="detail-org-icon">📦</span>
        <div class="detail-header-body">
          <h1 class="detail-title">${escapeHtml(order.title)}</h1>
          <p class="detail-meta">${escapeHtml(order.orderNo || '')}</p>
        </div>
      </header>

      <section class="detail-section">
        <h2 class="section-heading">基本情報</h2>
        <dl class="info-grid">${headerRows}</dl>
      </section>

      ${renderDetailSection('仕様', order.spec ? `<div class="prose"><p>${escapeHtml(order.spec)}</p></div>` : '')}
      ${renderDetailSection('備考', order.notes ? `<div class="prose"><p>${escapeHtml(order.notes)}</p></div>` : '')}
    </article>
  `;
}

function renderOrdersView() {
  const query = getSearchQuery();
  const filtered = filterOrders(query);
  const activeId = getActiveId(filtered);
  const activeOrder = activeId ? indexes.orderById.get(activeId) : null;

  const listHtml = `
    <div class="panel-header">
      <h2 class="panel-title">案件</h2>
      <span class="panel-count">${filtered.length} 件</span>
    </div>
    <ul class="entity-list" role="listbox">
      ${filtered.map(order => renderOrderListItem(order, order.id === activeId)).join('')}
    </ul>
  `;

  const detailHtml = activeOrder
    ? renderOrderDetail(activeOrder)
    : `<div class="detail-empty"><p>案件が見つかりません</p></div>`;

  contentArea.innerHTML = renderListLayout(listHtml, detailHtml);
  bindNavigation();
}

function renderClientCard(client, active) {
  const orders = ordersForClient(client.id);
  const qty = sumQuantity(orders);
  return `
    <article class="org-card ${active ? 'active' : ''}"
             data-nav-section="clients"
             data-nav-id="${client.id}">
      <span class="org-card-icon">🏢</span>
      <h3 class="org-card-name">${escapeHtml(client.name)}</h3>
      <p class="org-card-summary">${escapeHtml(client.contact || '')}</p>
      <p class="org-card-meta">案件 ${orders.length} 件 · 累計出数 ${qty.toLocaleString('ja-JP')}</p>
    </article>
  `;
}

function renderClientDetail(client) {
  const orders = ordersForClient(client.id);

  return `
    <article class="entity-detail">
      <header class="detail-header detail-header--compact">
        <span class="detail-org-icon">🏢</span>
        <div class="detail-header-body">
          <h1 class="detail-title">${escapeHtml(client.name)}</h1>
        </div>
      </header>

      <section class="detail-section">
        <h2 class="section-heading">連絡先</h2>
        <dl class="info-grid info-grid--compact">
          ${renderInfoRow('担当', escapeHtml(client.contact || '—'))}
          ${renderInfoRow('電話', escapeHtml(client.phone || '—'))}
          ${renderInfoRow('メール', escapeHtml(client.email || '—'))}
        </dl>
      </section>

      ${renderDetailSection('備考', client.notes ? `<div class="prose"><p>${escapeHtml(client.notes)}</p></div>` : '')}

      <section class="detail-section">
        <h2 class="section-heading">関連案件</h2>
        ${orders.length ? `
          <div class="order-table-wrap">
            <table class="order-table">
              <thead>
                <tr>
                  <th>管理番号</th>
                  <th>案件名</th>
                  <th class="col-qty">出数</th>
                  <th>納期</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                ${orders.map(order => `
                  <tr data-nav-section="orders" data-nav-id="${order.id}">
                    <td>${escapeHtml(order.orderNo || '—')}</td>
                    <td>${escapeHtml(order.title)}</td>
                    <td class="col-qty">${formatQuantity(order.quantity, order.unit)}</td>
                    <td class="${dueDateClass(order.dueDate, order.status)}">${formatDueDate(order.dueDate)}</td>
                    <td>${renderStatusBadge(order.status)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : renderEmpty('関連案件はありません')}
      </section>
    </article>
  `;
}

function renderClientsView() {
  const query = getSearchQuery();
  const filtered = filterClients(query);
  const activeId = getActiveId(filtered);
  const activeClient = activeId ? indexes.clientById.get(activeId) : null;

  const listHtml = `
    <div class="panel-header">
      <h2 class="panel-title">取引先</h2>
      <span class="panel-count">${filtered.length} 件</span>
    </div>
    <div class="org-card-list">
      ${filtered.map(client => renderClientCard(client, client.id === activeId)).join('')}
    </div>
  `;

  const detailHtml = activeClient
    ? renderClientDetail(activeClient)
    : `<div class="detail-empty"><p>取引先が見つかりません</p></div>`;

  contentArea.innerHTML = renderListLayout(listHtml, detailHtml);
  bindNavigation();
}

function renderProductListItem(product, active) {
  const orders = ordersForProduct(product.id);
  return `
    <li class="list-item ${active ? 'active' : ''}"
        data-nav-section="products"
        data-nav-id="${product.id}"
        role="option">
      <span class="list-icon">🏷️</span>
      <div class="list-item-info">
        <div class="list-item-name">${escapeHtml(product.name)}</div>
        <div class="list-item-sub">${escapeHtml(product.category || '')} · 案件 ${orders.length} 件</div>
      </div>
    </li>
  `;
}

function renderProductDetail(product) {
  const orders = ordersForProduct(product.id);
  const qty = sumQuantity(orders);

  return `
    <article class="entity-detail">
      <header class="detail-header detail-header--compact">
        <span class="detail-org-icon">🏷️</span>
        <div class="detail-header-body">
          <h1 class="detail-title">${escapeHtml(product.name)}</h1>
          <p class="detail-meta">${escapeHtml(product.category || '—')}</p>
        </div>
      </header>

      <section class="detail-section">
        <h2 class="section-heading">基本情報</h2>
        <dl class="info-grid info-grid--compact">
          ${renderInfoRow('カテゴリ', escapeHtml(product.category || '—'))}
          ${renderInfoRow('標準単位', escapeHtml(product.defaultUnit || '—'))}
          ${renderInfoRow('累計出数', `<span class="quantity-highlight">${qty.toLocaleString('ja-JP')} ${escapeHtml(product.defaultUnit)}</span>`)}
        </dl>
      </section>

      ${renderDetailSection('備考', product.notes ? `<div class="prose"><p>${escapeHtml(product.notes)}</p></div>` : '')}

      <section class="detail-section">
        <h2 class="section-heading">関連案件</h2>
        ${orders.length ? renderLinkList(
          orders.map(order =>
            renderLink(`#orders/${order.id}`, order.title, `${order.orderNo} · ${order.quantity}${order.unit}`)
          )
        ) : renderEmpty('関連案件はありません')}
      </section>
    </article>
  `;
}

function renderProductsView() {
  const query = getSearchQuery();
  const filtered = filterProducts(query);
  const activeId = getActiveId(filtered);
  const activeProduct = activeId ? indexes.productById.get(activeId) : null;

  const listHtml = `
    <div class="panel-header">
      <h2 class="panel-title">品目</h2>
      <span class="panel-count">${filtered.length} 件</span>
    </div>
    <ul class="entity-list">
      ${filtered.map(product => renderProductListItem(product, product.id === activeId)).join('')}
    </ul>
  `;

  const detailHtml = activeProduct
    ? renderProductDetail(activeProduct)
    : `<div class="detail-empty"><p>品目が見つかりません</p></div>`;

  contentArea.innerHTML = renderListLayout(listHtml, detailHtml);
  bindNavigation();
}

function renderGlobalSearchResults() {
  const query = getSearchQuery();
  if (!query) {
    render();
    return;
  }

  const results = {
    orders: filterOrders(query),
    clients: filterClients(query),
    products: filterProducts(query)
  };

  const total = results.orders.length + results.clients.length + results.products.length;

  const section = (title, items, renderItem) => {
    if (!items.length) return '';
    return `
      <section class="search-section">
        <h2 class="section-heading">${title}（${items.length}）</h2>
        <ul class="search-results">${items.map(item => renderItem(item)).join('')}</ul>
      </section>
    `;
  };

  contentArea.innerHTML = `
    <div class="search-results-panel">
      <h1 class="search-results-title">「${escapeHtml(query)}」の検索結果</h1>
      <p class="search-results-count">${total} 件</p>
      ${section('案件', results.orders, order => `
        <li class="search-result-item" data-nav-section="orders" data-nav-id="${order.id}">
          <span class="list-icon">📦</span>
          <div><strong>${escapeHtml(order.title)}</strong><span>${escapeHtml(order.orderNo || '')} · ${formatQuantity(order.quantity, order.unit)}</span></div>
        </li>
      `)}
      ${section('取引先', results.clients, client => `
        <li class="search-result-item" data-nav-section="clients" data-nav-id="${client.id}">
          <span class="list-icon">🏢</span>
          <div><strong>${escapeHtml(client.name)}</strong><span>${escapeHtml(client.contact || '')}</span></div>
        </li>
      `)}
      ${section('品目', results.products, product => `
        <li class="search-result-item" data-nav-section="products" data-nav-id="${product.id}">
          <span class="list-icon">🏷️</span>
          <div><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(product.category || '')}</span></div>
        </li>
      `)}
      ${total === 0 ? renderEmpty('該当する項目がありません') : ''}
    </div>
  `;

  bindNavigation();
  updateDocumentTitle();
}

function render() {
  document.body.classList.toggle('view-home', route.section === 'home' && !getSearchQuery());

  if (getSearchQuery()) {
    renderGlobalSearchResults();
    return;
  }

  switch (route.section) {
    case 'home':
      renderHomeView();
      break;
    case 'clients':
      renderClientsView();
      break;
    case 'products':
      renderProductsView();
      break;
    case 'orders':
    default:
      renderOrdersView();
      break;
  }

  updateDocumentTitle();
}

function renderFatalError(err) {
  contentArea.innerHTML = `
    <div class="error-panel">
      <h2>データの読み込みに失敗しました</h2>
      <p class="error-message">出数データを表示できません。HTTP サーバー経由で開いているか確認してください。</p>
    </div>
  `;
  console.error('[出数表入力]', err);
}

function renderNoticeBanner() {
  const existing = document.getElementById('noticeBanner');
  if (existing) existing.remove();
  if (!loadMeta.notices?.length) return;

  const banner = document.createElement('div');
  banner.id = 'noticeBanner';
  banner.className = 'notice-banner';

  banner.innerHTML = loadMeta.notices.map(notice => {
    const isFallback = loadMeta.orderSource === 'json-fallback';
    const title = notice.title || (isFallback ? '最新データを読み込めませんでした' : 'お知らせ');
    const message = notice.message || '';
    const fallback = notice.fallback ? `<p class="notice-fallback">${escapeHtml(notice.fallback)}</p>` : '';

    return `
      <div class="notice-item notice-warning">
        <p class="notice-title">${escapeHtml(title)}</p>
        <p class="notice-message">${escapeHtml(message)}</p>
        ${fallback}
      </div>
    `;
  }).join('');

  const header = document.querySelector('.header');
  if (header) header.insertAdjacentElement('afterend', banner);
}

function openSidebar() {
  sidebar.classList.add('open');
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  sidebar.classList.remove('open');
  overlay.classList.remove('active');
  document.body.style.overflow = '';
}

menuToggle.addEventListener('click', openSidebar);
sidebarClose.addEventListener('click', closeSidebar);
overlay.addEventListener('click', closeSidebar);

globalSearch.addEventListener('input', () => render());

globalSearch.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    globalSearch.value = '';
    render();
  }
});

navMenu.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    globalSearch.value = '';
    homeState.searchQuery = '';
    closeSidebar();
  });
});

window.addEventListener('hashchange', onHashChange);

async function init() {
  renderLoadingScreen();
  try {
    await loadData();
    route = parseHash();
    renderNoticeBanner();
    if (!route.id && route.section === 'orders' && store.orders.length > 0) {
      location.replace(`#orders/${store.orders[0].id}`);
      return;
    }
    updateNavActive();
    render();
  } catch (err) {
    renderFatalError(err);
  }
}

init();
