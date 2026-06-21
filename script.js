/* ========================================
   出数表入力 — 日ごと一覧 + ▽展開
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
const LOGO_PATH = 'images/seki-logo.png';
const PAGE_SIZE = 10;

const MENU_CATEGORIES = {
  daily: '日替わり',
  health: '健康ランチ',
  recommend: 'おすすめ',
  noodle: '麵ランチ',
  budget: 'お手頃350'
};

const OTHER_MENU_KEYS = ['health', 'recommend', 'noodle', 'budget'];

let appState = {
  searchQuery: '',
  visibleLimit: PAGE_SIZE,
  expandedDates: new Set()
};

let controlsBound = false;

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

function formatShortDate(value) {
  if (!value) return '—';
  const parts = value.split('-');
  if (parts.length === 3) {
    return `${Number(parts[1])}/${Number(parts[2])}`;
  }
  return value;
}

function getMenuName(menu, category) {
  if (!menu) return '';
  return menu.menus?.[category] || '';
}

function buildSearchHaystack(menu) {
  const parts = [
    menu.menuDate,
    formatShortDate(menu.menuDate),
    menu.assignee,
    menu.notes,
    ...Object.values(menu.menus || {})
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function normalizeSearchQuery(query) {
  return String(query || '').toLowerCase().trim();
}

function menuMatchesSearch(menu, query) {
  if (!query) return true;

  const haystack = buildSearchHaystack(menu);
  if (haystack.includes(query)) return true;

  const compactQuery = query.replace(/[\/\-.\s年月日]/g, '');
  if (compactQuery) {
    const compactHaystack = haystack.replace(/[\/\-.\s]/g, '');
    if (compactHaystack.includes(compactQuery)) return true;
  }

  return false;
}

function getSortedMenus() {
  return [...store.menus].sort((a, b) => b.menuDate.localeCompare(a.menuDate));
}

function getFilteredMenus() {
  const query = normalizeSearchQuery(appState.searchQuery);
  if (!query) return getSortedMenus();
  return getSortedMenus().filter(menu => menuMatchesSearch(menu, query));
}

function getVisibleMenus() {
  const filtered = getFilteredMenus();
  if (appState.searchQuery.trim()) return filtered;
  return filtered.slice(0, appState.visibleLimit);
}

function renderSearchableMenuValue(name) {
  if (!isPresent(name)) return escapeHtml(name);
  return `<span role="button" tabindex="0" class="day-search-link" data-search-term="${escapeAttr(name)}">${escapeHtml(name)}</span>`;
}

function applySearch(term) {
  appState.searchQuery = String(term || '').trim();
  appState.visibleLimit = PAGE_SIZE;
  appState.expandedDates.clear();

  const input = document.getElementById('appSearch');
  if (input) input.value = appState.searchQuery;

  updateDayList();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hasExpandableContent(menu) {
  return OTHER_MENU_KEYS.some(key => isPresent(getMenuName(menu, key))) ||
    isPresent(menu.notes) ||
    isPresent(menu.assignee) ||
    (menu.images?.length > 0) ||
    isPresent(menu.editUrl);
}

function renderAppTitlebar() {
  return `
    <div class="app-titlebar">
      <h1 class="app-titlebar-text">${escapeHtml(SITE_BANNER)}</h1>
      <img src="${LOGO_PATH}" alt="" class="app-titlebar-logo" width="56" height="56" decoding="async">
    </div>
  `;
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

function renderDayDetails(menu) {
  const rows = OTHER_MENU_KEYS
    .map(key => {
      const name = getMenuName(menu, key);
      if (!isPresent(name)) return '';
      return `
        <div class="day-detail-row">
          <span class="day-detail-label">${escapeHtml(MENU_CATEGORIES[key])}</span>
          <span class="day-detail-value">${renderSearchableMenuValue(name)}</span>
        </div>
      `;
    })
    .filter(Boolean)
    .join('');

  const assigneeHtml = isPresent(menu.assignee)
    ? `<div class="day-detail-row day-detail-row--meta"><span class="day-detail-label">入力者</span><span class="day-detail-value">${escapeHtml(menu.assignee)}</span></div>`
    : '';

  const notesHtml = isPresent(menu.notes)
    ? `<div class="day-detail-notes"><p>${escapeHtml(menu.notes)}</p></div>`
    : '';

  const imageLinks = (menu.images || []).map((url, i) =>
    `<a href="${escapeAttr(url)}" class="day-detail-image-link" target="_blank" rel="noopener noreferrer">画像 ${i + 1}</a>`
  ).join('');
  const editLink = isPresent(menu.editUrl)
    ? `<a href="${escapeAttr(menu.editUrl)}" class="day-detail-edit-link" target="_blank" rel="noopener noreferrer">編集</a>`
    : '';
  const imagesHtml = imageLinks || editLink
    ? `<div class="day-detail-images">${imageLinks}${editLink}</div>`
    : '';

  return `
    <div class="day-row-detail">
      ${rows || ''}
      ${assigneeHtml}
      ${notesHtml}
      ${imagesHtml}
    </div>
  `;
}

function renderDayRow(menu) {
  const expanded = appState.expandedDates.has(menu.menuDate);
  const dailyName = getMenuName(menu, 'daily');
  const dailyText = isPresent(dailyName) ? dailyName : '—';
  const expandable = hasExpandableContent(menu);

  const headInner = `
    <span class="day-row-date">${escapeHtml(formatShortDate(menu.menuDate))}</span>
    <span class="day-row-daily">日替わり：${isPresent(dailyName) ? renderSearchableMenuValue(dailyName) : escapeHtml(dailyText)}</span>
    ${expandable ? `<span class="day-row-toggle" aria-hidden="true">${expanded ? '△' : '▽'}</span>` : ''}
  `;

  return `
    <article class="day-row ${expanded ? 'is-expanded' : ''}">
      ${expandable ? `
        <button
          type="button"
          class="day-row-head"
          data-toggle-day="${escapeAttr(menu.menuDate)}"
          aria-expanded="${expanded}"
        >${headInner}</button>
      ` : `
        <div class="day-row-head day-row-head--plain">${headInner}</div>
      `}
      ${expanded && expandable ? renderDayDetails(menu) : ''}
    </article>
  `;
}

function renderDayListBlock() {
  const filtered = getFilteredMenus();
  const visible = getVisibleMenus();
  const isSearching = Boolean(appState.searchQuery.trim());
  const hasMore = !isSearching && visible.length < filtered.length;

  if (!visible.length) {
    return `
      <div class="day-list-empty">
        ${renderEmpty(isSearching ? '該当する日がありません' : 'データがありません')}
      </div>
    `;
  }

  return `
    <div class="day-list">
      ${visible.map(menu => renderDayRow(menu)).join('')}
    </div>
    ${hasMore ? `
      <button type="button" id="loadMoreBtn" class="load-more-btn">
        さらに ${PAGE_SIZE} 日を表示（残り ${filtered.length - visible.length} 日）
      </button>
    ` : ''}
    ${isSearching ? `<p class="search-result-count">${filtered.length} 件ヒット</p>` : ''}
  `;
}

function formatLongDate(value) {
  if (!value) return '—';
  const parts = value.split('-');
  if (parts.length === 3) {
    return `${parts[0]}/${Number(parts[1])}/${Number(parts[2])}`;
  }
  return value;
}

function renderListMeta() {
  const sorted = getSortedMenus();
  const filtered = getFilteredMenus();
  const visible = getVisibleMenus();
  const isSearching = Boolean(appState.searchQuery.trim());
  const latest = sorted[0]?.menuDate;
  const oldest = sorted[sorted.length - 1]?.menuDate;

  const statusText = isSearching
    ? `「${appState.searchQuery.trim()}」で ${filtered.length} 件`
    : `${visible.length} / ${filtered.length} 日を表示`;

  return `
    <div class="app-list-meta" id="appListMeta">
      <div class="app-list-meta-item">
        <span class="app-list-meta-label">登録</span>
        <span class="app-list-meta-value">${sorted.length} 日分</span>
      </div>
      <div class="app-list-meta-item">
        <span class="app-list-meta-label">期間</span>
        <span class="app-list-meta-value">${formatLongDate(oldest)} 〜 ${formatLongDate(latest)}</span>
      </div>
      <div class="app-list-meta-item app-list-meta-item--status">
        <span class="app-list-meta-label">表示</span>
        <span class="app-list-meta-value">${statusText}</span>
      </div>
    </div>
  `;
}

function renderAppFooter() {
  const formUrl = (window.AppLinks || {}).orderForm || '#';
  const formReady = formUrl && formUrl !== '#';
  const formLink = formReady
    ? `<a href="${escapeAttr(formUrl)}" class="app-footer-link" target="_blank" rel="noopener noreferrer">Googleフォームで入力</a>`
    : '';

  return `
    <footer class="app-footer">
      <div class="app-footer-card">
        <div class="app-footer-brand">
          <img src="${LOGO_PATH}" alt="" class="app-footer-logo" width="48" height="48" decoding="async">
          <div>
            <p class="app-footer-title">${escapeHtml(SITE_BANNER)}</p>
            <p class="app-footer-tagline">メニュー確認・検索・入力のポータル</p>
          </div>
        </div>
        <div class="app-footer-stats" id="appFooterStats"></div>
        <div class="app-footer-actions">
          ${formLink}
          <span class="app-footer-hint">各行の ▽ から詳細・画像・編集へ</span>
        </div>
      </div>
      <p class="app-footer-copy">${escapeHtml(SITE_NAME)}</p>
    </footer>
  `;
}

function updateAppFooterStats() {
  const mount = document.getElementById('appFooterStats');
  if (!mount) return;

  const sorted = getSortedMenus();
  const filtered = getFilteredMenus();
  const visible = getVisibleMenus();
  const latest = sorted[0]?.menuDate;

  mount.innerHTML = `
    <div class="app-footer-stat">
      <span class="app-footer-stat-num">${sorted.length}</span>
      <span class="app-footer-stat-label">登録日数</span>
    </div>
    <div class="app-footer-stat">
      <span class="app-footer-stat-num">${visible.length}</span>
      <span class="app-footer-stat-label">表示中</span>
    </div>
    <div class="app-footer-stat">
      <span class="app-footer-stat-num app-footer-stat-num--date">${escapeHtml(formatShortDate(latest))}</span>
      <span class="app-footer-stat-label">最新</span>
    </div>
    ${appState.searchQuery.trim()
      ? `<div class="app-footer-stat"><span class="app-footer-stat-num">${filtered.length}</span><span class="app-footer-stat-label">検索結果</span></div>`
      : ''}
  `;
}

function updateDayList() {
  const mount = document.getElementById('dayListMount');
  if (!mount) return;
  mount.innerHTML = renderListMeta() + renderDayListBlock();
  updateAppFooterStats();
}

function bindControls() {
  if (controlsBound) return;
  controlsBound = true;

  contentArea.addEventListener('input', e => {
    if (e.target.id !== 'appSearch') return;
    appState.searchQuery = e.target.value;
    appState.visibleLimit = PAGE_SIZE;
    updateDayList();
  });

  contentArea.addEventListener('click', e => {
    const searchLink = e.target.closest('[data-search-term]');
    if (searchLink) {
      e.preventDefault();
      e.stopPropagation();
      applySearch(searchLink.dataset.searchTerm);
      return;
    }

    const toggleBtn = e.target.closest('[data-toggle-day]');
    if (toggleBtn) {
      const date = toggleBtn.dataset.toggleDay;
      if (appState.expandedDates.has(date)) {
        appState.expandedDates.delete(date);
      } else {
        appState.expandedDates.add(date);
      }
      updateDayList();
      return;
    }

    if (e.target.closest('#loadMoreBtn')) {
      appState.visibleLimit += PAGE_SIZE;
      updateDayList();
    }
  });

  contentArea.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const searchLink = e.target.closest('[data-search-term]');
    if (!searchLink) return;
    e.preventDefault();
    applySearch(searchLink.dataset.searchTerm);
  });
}

function renderLoadingScreen() {
  contentArea.innerHTML = `
    <div class="portal-loading" role="status" aria-live="polite">
      <img src="${LOGO_PATH}" alt="" class="portal-loading-logo" width="64" height="64" decoding="async">
      <p class="portal-loading-brand">${SITE_NAME}</p>
      <p class="portal-loading-message">データを読み込んでいます…</p>
      <div class="portal-loading-bar" aria-hidden="true"><span></span></div>
    </div>
  `;
}

function renderShell() {
  const formUrl = (window.AppLinks || {}).orderForm || '#';
  const formReady = formUrl && formUrl !== '#';

  const formButton = formReady
    ? `<a href="${escapeAttr(formUrl)}" class="home-input-btn" target="_blank" rel="noopener noreferrer">入力</a>`
    : `<span class="home-input-btn home-input-btn--disabled">入力</span>`;

  contentArea.innerHTML = `
    <div class="app-shell">
      <div class="app-page">
        ${renderNoticeBanner()}

        <header class="app-header">
          ${renderAppTitlebar()}
          <div class="app-toolbar">
            <div class="home-search-row">
              <svg class="home-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input type="search" id="appSearch" class="home-search-input" placeholder="日付・メニューを検索..." aria-label="検索" autocomplete="off">
            </div>
            ${formButton}
          </div>
        </header>

        <div id="dayListMount"></div>
      </div>
      ${renderAppFooter()}
    </div>
  `;

  document.title = SITE_NAME;
  bindControls();
  updateDayList();
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
    renderShell();
  } catch (err) {
    renderFatalError(err);
  }
}

init();
