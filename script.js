/* ========================================
   出数表入力 — 日付×メニュー名
   ======================================== */

const store = { menus: [] };

const indexes = {
  menuById: new Map(),
  menuByDate: new Map()
};

let route = { section: 'home', id: null };
let loadMeta = { menuSource: '', notices: [] };

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
  daily: '日替わり',
  health: '健康ランチ',
  recommend: 'おすすめ',
  noodle: '麵ランチ',
  budget: 'お手頃350'
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
  store.menus = data.menus;
  indexes.menuById = built.menuById;
  indexes.menuByDate = built.menuByDate;
  loadMeta = meta || { menuSource: '', notices: [] };
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
  const menu = route.id ? indexes.menuById.get(route.id) : null;
  document.title = menu ? `${formatDisplayDate(menu.menuDate)} — ${SITE_NAME}` : SITE_NAME;
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

function renderListLayout(listHtml, detailHtml) {
  return `
    <div class="list-panel">${listHtml}</div>
    <div class="detail-panel">${detailHtml}</div>
  `;
}

function renderDetailSection(heading, bodyHtml) {
  if (!bodyHtml || !String(bodyHtml).trim()) return '';
  return `
    <section class="detail-section">
      <h2 class="section-heading">${escapeHtml(heading)}</h2>
      ${bodyHtml}
    </section>
  `;
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

function getActiveId(filtered) {
  if (route.id && filtered.some(item => item.id === route.id)) return route.id;
  return filtered[0]?.id || null;
}

function toDateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(value) {
  if (!value) return '—';
  const parts = value.split('-');
  if (parts.length === 3) {
    return `${parts[0]}/${parts[1]}/${parts[2]}`;
  }
  return value;
}

function initHomeState() {
  if (!homeState.selectedDate) {
    homeState.selectedDate = toDateInputValue(new Date());
  }
}

function getMenuForDate(date) {
  return indexes.menuByDate.get(date) || null;
}

function getMenuName(menu, category) {
  if (!menu) return '';
  return menu.menus?.[category] || '';
}

function filterMenus(query) {
  return store.menus.filter(menu => {
    const names = Object.values(menu.menus || {});
    return matchesQuery(menu.menuDate, query) ||
      names.some(name => matchesQuery(name, query)) ||
      matchesQuery(menu.notes, query);
  });
}

function searchMenusForHome(query) {
  if (!query) return [];
  return store.menus.filter(menu => {
    const names = Object.entries(menu.menus || {})
      .map(([cat, name]) => ({ cat, name }))
      .filter(item => matchesQuery(item.name, query));
    return names.length > 0 || matchesQuery(menu.notes, query);
  }).flatMap(menu => {
    return Object.entries(menu.menus || {})
      .filter(([, name]) => matchesQuery(name, query))
      .map(([cat, name]) => ({ menu, category: cat, name }));
  });
}

function renderHomeSearchResults(query) {
  const hits = searchMenusForHome(query);
  if (!hits.length) {
    return `<div class="home-menu-empty">${renderEmpty('該当するメニューがありません')}</div>`;
  }
  return `
    <ul class="home-search-results">
      ${hits.slice(0, 20).map(hit => `
        <li class="home-search-item" data-nav-section="menus" data-nav-id="${hit.menu.id}">
          <span class="home-search-date">${escapeHtml(formatDisplayDate(hit.menu.menuDate))}</span>
          <span class="home-search-cat">${escapeHtml(MENU_CATEGORIES[hit.category] || hit.category)}</span>
          <span class="home-search-name">${escapeHtml(hit.name)}</span>
        </li>
      `).join('')}
    </ul>
  `;
}

function renderHomeMenuCard(menu, category) {
  const label = MENU_CATEGORIES[category] || '日替わり';
  const name = getMenuName(menu, category);

  if (!menu) {
    return `
      <div class="home-menu-card home-menu-card--empty">
        <p class="home-menu-card-label">${escapeHtml(label)}</p>
        <p class="home-menu-card-name">${renderEmpty('この日のデータがありません')}</p>
      </div>
    `;
  }

  if (!isPresent(name)) {
    return `
      <div class="home-menu-card home-menu-card--empty">
        <p class="home-menu-card-label">${escapeHtml(label)}</p>
        <p class="home-menu-card-name">${renderEmpty('メニュー未登録')}</p>
      </div>
    `;
  }

  const notesHtml = category === 'daily' && isPresent(menu.notes)
    ? `<div class="home-menu-notes"><p>${escapeHtml(menu.notes)}</p></div>`
    : '';

  const imagesHtml = menu.images?.length
    ? `<div class="home-menu-images">${menu.images.map((url, i) =>
        `<a href="${escapeAttr(url)}" class="home-menu-image-link" target="_blank" rel="noopener noreferrer">画像 ${i + 1}</a>`
      ).join('')}</div>`
    : '';

  return `
    <div class="home-menu-card">
      <p class="home-menu-card-label">${escapeHtml(label)}</p>
      <p class="home-menu-card-name">${escapeHtml(name)}</p>
      ${notesHtml}
      ${imagesHtml}
    </div>
  `;
}

function bindHomeControls() {
  document.getElementById('homeDate')?.addEventListener('change', e => {
    homeState.selectedDate = e.target.value;
    renderHomeView();
  });

  document.getElementById('homeMenuToggle')?.addEventListener('click', () => {
    homeState.menuOpen = !homeState.menuOpen;
    renderHomeView();
  });

  document.getElementById('homeDailyReset')?.addEventListener('click', () => {
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

  document.getElementById('homeSearch')?.addEventListener('input', e => {
    homeState.searchQuery = e.target.value;
    const panel = document.getElementById('homeSearchResults');
    if (panel) {
      panel.innerHTML = homeState.searchQuery.trim()
        ? renderHomeSearchResults(homeState.searchQuery.toLowerCase().trim())
        : '';
      bindNavigation();
    }
  });
}

function renderHomeView() {
  initHomeState();
  document.body.classList.add('view-home');

  const formUrl = (window.AppLinks || {}).orderForm || '#';
  const formReady = formUrl && formUrl !== '#';
  const categoryLabel = MENU_CATEGORIES[homeState.selectedCategory] || '日替わり';
  const menu = getMenuForDate(homeState.selectedDate);
  const hasSearch = homeState.searchQuery.trim().length > 0;

  const formButton = formReady
    ? `<a href="${escapeAttr(formUrl)}" class="home-input-btn" target="_blank" rel="noopener noreferrer">入力</a>`
    : `<span class="home-input-btn home-input-btn--disabled">入力</span>`;

  contentArea.innerHTML = `
    <div class="home-page">
      <header class="home-header">
        <div class="home-banner">
          <h1 class="home-banner-title">${escapeHtml(SITE_BANNER)}</h1>
          <img src="images/shokudo-logo.svg" alt="" class="home-banner-logo" width="56" height="56" decoding="async">
        </div>
        <div class="home-search-row">
          <svg class="home-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
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
          <div class="home-category-list">
            ${OTHER_MENU_KEYS.map(key => `
              <button type="button" class="home-category-btn ${homeState.selectedCategory === key ? 'is-active' : ''}" data-home-category="${key}">
                ${escapeHtml(MENU_CATEGORIES[key])}
              </button>
            `).join('')}
          </div>
        ` : ''}

        <div id="homeSearchResults" class="home-search-results-wrap">
          ${hasSearch ? renderHomeSearchResults(homeState.searchQuery.toLowerCase().trim()) : ''}
        </div>

        ${hasSearch ? '' : renderHomeMenuCard(menu, homeState.selectedCategory)}
      </section>
    </div>
  `;

  bindHomeControls();
  bindNavigation();
}

function renderMenuListItem(menu, active) {
  const dailyName = getMenuName(menu, 'daily') || '—';
  return `
    <li class="list-item ${active ? 'active' : ''}"
        data-nav-section="menus"
        data-nav-id="${menu.id}"
        role="option">
      <span class="list-icon">📅</span>
      <div class="list-item-info">
        <div class="list-item-name">${escapeHtml(formatDisplayDate(menu.menuDate))}</div>
        <div class="list-item-sub">${escapeHtml(dailyName)}</div>
      </div>
    </li>
  `;
}

function renderMenuDetail(menu) {
  const rows = ['daily', ...OTHER_MENU_KEYS].map(key => {
    const name = getMenuName(menu, key);
    if (!isPresent(name)) return '';
    return `
      <div class="menu-detail-row">
        <dt>${escapeHtml(MENU_CATEGORIES[key])}</dt>
        <dd>${escapeHtml(name)}</dd>
      </div>
    `;
  }).join('');

  const imagesHtml = menu.images?.length
    ? `<div class="home-menu-images">${menu.images.map((url, i) =>
        `<a href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">画像 ${i + 1}</a>`
      ).join('')}</div>`
    : '';

  return `
    <article class="entity-detail">
      <header class="detail-header detail-header--compact">
        <span class="detail-org-icon">📅</span>
        <div class="detail-header-body">
          <h1 class="detail-title">${escapeHtml(formatDisplayDate(menu.menuDate))}</h1>
        </div>
      </header>

      <section class="detail-section">
        <h2 class="section-heading">メニュー</h2>
        <dl class="menu-detail-grid">${rows || renderEmpty()}</dl>
      </section>

      ${renderDetailSection('備考', menu.notes ? `<div class="prose"><p>${escapeHtml(menu.notes)}</p></div>` : '')}
      ${renderDetailSection('画像', imagesHtml)}
    </article>
  `;
}

function renderMenusView() {
  const query = getSearchQuery();
  const filtered = filterMenus(query).sort((a, b) => b.menuDate.localeCompare(a.menuDate));
  const activeId = getActiveId(filtered);
  const activeMenu = activeId ? indexes.menuById.get(activeId) : null;

  const listHtml = `
    <div class="panel-header">
      <h2 class="panel-title">日付一覧</h2>
      <span class="panel-count">${filtered.length} 件</span>
    </div>
    <ul class="entity-list">${filtered.map(menu => renderMenuListItem(menu, menu.id === activeId)).join('')}</ul>
  `;

  const detailHtml = activeMenu
    ? renderMenuDetail(activeMenu)
    : `<div class="detail-empty"><p>日付が見つかりません</p></div>`;

  contentArea.innerHTML = renderListLayout(listHtml, detailHtml);
  bindNavigation();
}

function renderGlobalSearchResults() {
  const query = getSearchQuery();
  if (!query) {
    render();
    return;
  }

  const results = filterMenus(query);

  contentArea.innerHTML = `
    <div class="search-results-panel">
      <h1 class="search-results-title">「${escapeHtml(query)}」の検索結果</h1>
      <p class="search-results-count">${results.length} 件</p>
      <ul class="search-results">
        ${results.map(menu => `
          <li class="search-result-item" data-nav-section="menus" data-nav-id="${menu.id}">
            <span class="list-icon">📅</span>
            <div>
              <strong>${escapeHtml(formatDisplayDate(menu.menuDate))}</strong>
              <span>${escapeHtml(getMenuName(menu, 'daily') || '—')}</span>
            </div>
          </li>
        `).join('')}
      </ul>
      ${results.length === 0 ? renderEmpty('該当する項目がありません') : ''}
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
    case 'menus':
      renderMenusView();
      break;
    case 'home':
    default:
      renderHomeView();
      break;
  }

  updateDocumentTitle();
}

function renderFatalError(err) {
  contentArea.innerHTML = `
    <div class="error-panel">
      <h2>データの読み込みに失敗しました</h2>
      <p class="error-message">メニューデータを表示できません。</p>
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
    const isFallback = loadMeta.menuSource === 'json-fallback';
    const title = notice.title || (isFallback ? '最新データを読み込めませんでした' : 'お知らせ');
    return `
      <div class="notice-item notice-warning">
        <p class="notice-title">${escapeHtml(title)}</p>
        <p class="notice-message">${escapeHtml(notice.message || '')}</p>
        ${notice.fallback ? `<p class="notice-fallback">${escapeHtml(notice.fallback)}</p>` : ''}
      </div>
    `;
  }).join('');

  document.querySelector('.header')?.insertAdjacentElement('afterend', banner);
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
    updateNavActive();
    render();
  } catch (err) {
    renderFatalError(err);
  }
}

init();
