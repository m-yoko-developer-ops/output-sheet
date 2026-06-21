/* ========================================
   出数表入力 — 日付×メニュー名（1画面）
   ======================================== */

const store = { menus: [] };

const indexes = {
  menuById: new Map(),
  menuByDate: new Map()
};

let loadMeta = { menuSource: '', notices: [] };

const contentArea = document.getElementById('contentArea');

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

let appState = {
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

function initAppState() {
  if (!appState.selectedDate) {
    appState.selectedDate = toDateInputValue(new Date());
  }
}

function getMenuForDate(date) {
  return indexes.menuByDate.get(date) || null;
}

function getMenuName(menu, category) {
  if (!menu) return '';
  return menu.menus?.[category] || '';
}

function matchesQuery(text, query) {
  return !query || (text || '').toLowerCase().includes(query);
}

function searchMenus(query) {
  if (!query) return [];
  return store.menus.flatMap(menu => {
    return Object.entries(menu.menus || {})
      .filter(([, name]) => matchesQuery(name, query))
      .map(([cat, name]) => ({ menu, category: cat, name }));
  });
}

function renderNoticeBanner() {
  if (!loadMeta.notices?.length) return '';

  return `
    <div class="notice-banner notice-banner--inline">
      ${loadMeta.notices.map(notice => {
        const isFallback = loadMeta.menuSource === 'json-fallback';
        const title = notice.title || (isFallback ? '最新データを読み込めませんでした' : 'お知らせ');
        return `
          <div class="notice-item notice-warning">
            <p class="notice-title">${escapeHtml(title)}</p>
            <p class="notice-message">${escapeHtml(notice.message || '')}</p>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderSearchResults(query) {
  const hits = searchMenus(query);
  if (!hits.length) {
    return `<div class="home-menu-empty">${renderEmpty('該当するメニューがありません')}</div>`;
  }

  return `
    <ul class="home-search-results">
      ${hits.slice(0, 30).map(hit => `
        <li class="home-search-item" data-search-date="${escapeAttr(hit.menu.menuDate)}" data-search-category="${hit.category}">
          <span class="home-search-date">${escapeHtml(formatDisplayDate(hit.menu.menuDate))}</span>
          <span class="home-search-cat">${escapeHtml(MENU_CATEGORIES[hit.category] || hit.category)}</span>
          <span class="home-search-name">${escapeHtml(hit.name)}</span>
        </li>
      `).join('')}
    </ul>
  `;
}

function renderMenuCard(menu, category) {
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

  const assigneeHtml = isPresent(menu.assignee)
    ? `<p class="home-menu-assignee">入力: ${escapeHtml(menu.assignee)}</p>`
    : '';

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
      ${assigneeHtml}
      ${notesHtml}
      ${imagesHtml}
    </div>
  `;
}

function bindControls() {
  document.getElementById('appDate')?.addEventListener('change', e => {
    appState.selectedDate = e.target.value;
    render();
  });

  document.getElementById('appMenuToggle')?.addEventListener('click', () => {
    appState.menuOpen = !appState.menuOpen;
    render();
  });

  document.getElementById('appDailyReset')?.addEventListener('click', () => {
    appState.selectedCategory = 'daily';
    appState.menuOpen = false;
    render();
  });

  contentArea.querySelectorAll('[data-app-category]').forEach(btn => {
    btn.addEventListener('click', () => {
      appState.selectedCategory = btn.dataset.appCategory;
      appState.menuOpen = false;
      render();
    });
  });

  document.getElementById('appSearch')?.addEventListener('input', e => {
    appState.searchQuery = e.target.value;
    const panel = document.getElementById('appSearchResults');
    if (panel) {
      panel.innerHTML = appState.searchQuery.trim()
        ? renderSearchResults(appState.searchQuery.toLowerCase().trim())
        : '';
      bindSearchResults();
    }
  });

  bindSearchResults();
}

function bindSearchResults() {
  contentArea.querySelectorAll('[data-search-date]').forEach(el => {
    el.addEventListener('click', () => {
      appState.selectedDate = el.dataset.searchDate;
      appState.selectedCategory = el.dataset.searchCategory || 'daily';
      appState.searchQuery = '';
      appState.menuOpen = false;
      render();
    });
  });
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

function render() {
  initAppState();

  const formUrl = (window.AppLinks || {}).orderForm || '#';
  const formReady = formUrl && formUrl !== '#';
  const categoryLabel = MENU_CATEGORIES[appState.selectedCategory] || '日替わり';
  const menu = getMenuForDate(appState.selectedDate);
  const hasSearch = appState.searchQuery.trim().length > 0;
  const query = appState.searchQuery.toLowerCase().trim();

  const formButton = formReady
    ? `<a href="${escapeAttr(formUrl)}" class="home-input-btn" target="_blank" rel="noopener noreferrer">入力</a>`
    : `<span class="home-input-btn home-input-btn--disabled">入力</span>`;

  contentArea.innerHTML = `
    <div class="app-page">
      ${renderNoticeBanner()}

      <header class="app-header">
        <div class="home-banner">
          <h1 class="home-banner-title">${escapeHtml(SITE_BANNER)}</h1>
          <img src="images/shokudo-logo.svg" alt="" class="home-banner-logo" width="56" height="56" decoding="async">
        </div>
        <div class="home-search-row">
          <svg class="home-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input type="search" id="appSearch" class="home-search-input" placeholder="メニューを検索..." value="${escapeAttr(appState.searchQuery)}" aria-label="メニュー検索">
        </div>
        ${formButton}
      </header>

      <section class="home-controls">
        <div class="home-date-row">
          <label class="home-field-label" for="appDate">日付</label>
          <input type="date" id="appDate" class="home-date-input" value="${escapeAttr(appState.selectedDate)}">
        </div>

        <div class="home-menu-row">
          <span class="home-field-label">メニュー</span>
          <button type="button" id="appMenuToggle" class="home-menu-toggle" aria-expanded="${appState.menuOpen}">
            <span class="home-menu-toggle-label">${escapeHtml(categoryLabel)}</span>
            <span class="home-menu-caret" aria-hidden="true">▼</span>
          </button>
          ${appState.selectedCategory !== 'daily' ? `
            <button type="button" id="appDailyReset" class="home-daily-reset">日替わりに戻す</button>
          ` : ''}
        </div>

        ${appState.menuOpen ? `
          <div class="home-category-list">
            ${OTHER_MENU_KEYS.map(key => `
              <button type="button" class="home-category-btn ${appState.selectedCategory === key ? 'is-active' : ''}" data-app-category="${key}">
                ${escapeHtml(MENU_CATEGORIES[key])}
              </button>
            `).join('')}
          </div>
        ` : ''}

        <div id="appSearchResults" class="home-search-results-wrap">
          ${hasSearch ? renderSearchResults(query) : ''}
        </div>

        ${hasSearch ? '' : renderMenuCard(menu, appState.selectedCategory)}
      </section>
    </div>
  `;

  document.title = `${formatDisplayDate(appState.selectedDate)} — ${SITE_NAME}`;
  bindControls();
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

async function init() {
  renderLoadingScreen();
  try {
    await loadData();
    render();
  } catch (err) {
    renderFatalError(err);
  }
}

init();
