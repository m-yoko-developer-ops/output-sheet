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
const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

let appState = {
  searchQuery: '',
  visibleLimit: PAGE_SIZE,
  expandedDates: new Set()
};

let controlsBound = false;

const LOADING_MIN_MS = 650;
const CROSSFADE_MS = 520;
const LIST_ENTER_MS = 420;
const LIST_ENTER_DELAY_MS = 90;

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildShellMarkup({ shellEnter = false } = {}) {
  const formUrl = (window.AppLinks || {}).orderForm || '#';
  const formReady = formUrl && formUrl !== '#';
  const formButton = formReady
    ? `<a href="${escapeAttr(formUrl)}" class="home-input-btn" target="_blank" rel="noopener noreferrer">入力</a>`
    : `<span class="home-input-btn home-input-btn--disabled">入力</span>`;
  const shellClass = shellEnter ? 'app-shell app-shell--enter' : 'app-shell';

  return `
    <div class="${shellClass}">
      <div class="app-page">
        ${renderNoticeBanner()}

        <header class="app-header">
          ${renderAppHeaderBrand()}
          <div class="app-header-tools">
            <div class="home-search-row">
              <svg class="home-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input type="search" id="appSearch" class="home-search-input" placeholder="日付・メニューを検索..." aria-label="検索" autocomplete="off">
              <button type="button" id="appSearchClear" class="home-search-clear" aria-label="検索をクリア" hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            ${formButton}
          </div>
        </header>

        <div id="dayListMount" class="day-list-mount"></div>
      </div>
      ${renderAppFooter()}
    </div>
  `;
}

function mountShellControls() {
  document.title = SITE_NAME;
  bindControls();
  window.AppAccessGate?.bindSettings?.();
}

function revealListMount() {
  const listMount = document.getElementById('dayListMount');
  if (!listMount) return;

  updateDayList();

  if (prefersReducedMotion()) return;

  listMount.classList.add('day-list-mount--enter');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => listMount.classList.add('is-visible'));
  });
}

async function transitionFromLoadingToShell() {
  const loadingEl = contentArea.querySelector('.portal-loading');

  if (prefersReducedMotion()) {
    if (loadingEl) loadingEl.remove();
    contentArea.innerHTML = buildShellMarkup();
    mountShellControls();
    updateDayList();
    return;
  }

  const reveal = document.createElement('div');
  reveal.className = 'app-reveal';
  reveal.innerHTML = buildShellMarkup({ shellEnter: true });
  contentArea.innerHTML = '';
  contentArea.appendChild(reveal);

  if (loadingEl) {
    loadingEl.classList.add('portal-loading--overlay');
    loadingEl.setAttribute('aria-hidden', 'true');
    contentArea.appendChild(loadingEl);
  }

  mountShellControls();

  const shell = reveal.querySelector('.app-shell');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      shell?.classList.add('is-visible');
      loadingEl?.classList.add('portal-loading--exit');
    });
  });

  await sleep(CROSSFADE_MS);
  loadingEl?.remove();

  await sleep(LIST_ENTER_DELAY_MS);
  revealListMount();
  await sleep(LIST_ENTER_MS);
}

async function fadeOutLoadingOverlay() {
  if (prefersReducedMotion()) return;

  const loading = contentArea.querySelector('.portal-loading');
  if (!loading) return;

  loading.classList.add('portal-loading--overlay', 'portal-loading--exit');
  await sleep(CROSSFADE_MS);
  loading.remove();
}

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
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    const weekday = WEEKDAY_LABELS[new Date(Number(parts[0]), month - 1, day).getDay()];
    return `${month}/${day}(${weekday})`;
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

function applySearch(term, options = {}) {
  const { scrollToTop = true, focusSearch = false } = options;
  appState.searchQuery = String(term || '').trim();
  appState.visibleLimit = PAGE_SIZE;
  appState.expandedDates.clear();

  const input = document.getElementById('appSearch');
  if (input) input.value = appState.searchQuery;

  updateDayList();
  updateSearchClearButton();

  if (scrollToTop) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (focusSearch) {
    input?.focus({ preventScroll: true });
  }
}

function updateSearchClearButton() {
  const btn = document.getElementById('appSearchClear');
  const input = document.getElementById('appSearch');
  if (!btn || !input) return;

  const hasValue = Boolean(input.value);
  btn.hidden = !hasValue;
}

function clearSearch() {
  const input = document.getElementById('appSearch');
  appState.searchQuery = '';
  appState.visibleLimit = PAGE_SIZE;
  appState.expandedDates.clear();

  if (input) {
    input.value = '';
    input.focus();
  }

  updateDayList();
  updateSearchClearButton();
}

function hasExpandableContent(menu) {
  return OTHER_MENU_KEYS.some(key => isPresent(getMenuName(menu, key))) ||
    isPresent(menu.notes) ||
    isPresent(menu.assignee) ||
    (menu.images?.length > 0) ||
    isPresent(menu.editUrl);
}

function renderAppHeaderBrand() {
  const manualUrl = (window.AppLinks || {}).manualUrl || 'manual.html';

  return `
    <div class="app-header-brand">
      <img src="${LOGO_PATH}" alt="" class="app-header-logo" width="48" height="48" decoding="async">
      <div class="app-header-text">
        <h1 class="app-header-title">${escapeHtml(SITE_BANNER)}</h1>
        <p class="app-header-tagline">日付ごとのメニュー一覧</p>
      </div>
      <a href="${escapeAttr(manualUrl)}" class="app-header-help">使い方</a>
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

function getSiteCredit() {
  const credit = window.AppLinks?.credit || {};

  return {
    trialLabel: String(credit.trialLabel || 'お試し版'),
    startYear: Number(credit.startYear) || new Date().getFullYear(),
    companyName: String(credit.companyName || 'Owl Technology, inc').trim() || 'Owl Technology, inc',
    companyUrl: String(credit.companyUrl || credit.authorUrl || 'https://owl-tec.co.jp/').trim()
  };
}

function renderFooterCreditBar() {
  const credit = getSiteCredit();
  const companyHtml = credit.companyUrl
    ? `<a href="${escapeAttr(credit.companyUrl)}" class="app-footer-author" target="_blank" rel="noopener noreferrer">${escapeHtml(credit.companyName)}</a>`
    : escapeHtml(credit.companyName);

  return `
    <div class="app-footer-bar">
      <span class="app-footer-trial">${escapeHtml(credit.trialLabel)}</span>
      <div class="app-footer-bar-actions">
        ${window.AppAccessGate?.renderFooterButtons?.() || ''}
        <span class="app-footer-copyright">© ${companyHtml} ${escapeHtml(String(credit.startYear))}</span>
      </div>
    </div>
  `;
}

function renderAppFooter() {
  return `
    <footer class="app-footer">
      ${renderFooterCreditBar()}
    </footer>
  `;
}

function renderListSectionHeader() {
  return `
    <div class="app-list-head">
      <h2 class="app-list-title">メニュー一覧</h2>
      <p class="app-list-lead">▽ で詳細表示</p>
    </div>
  `;
}

function updateDayList() {
  const mount = document.getElementById('dayListMount');
  if (!mount) return;
  mount.innerHTML = renderListSectionHeader() + renderListMeta() + renderDayListBlock();
}

function bindControls() {
  if (controlsBound) return;
  controlsBound = true;

  contentArea.addEventListener('input', e => {
    if (e.target.id !== 'appSearch') return;
    appState.searchQuery = e.target.value;
    appState.visibleLimit = PAGE_SIZE;
    updateDayList();
    updateSearchClearButton();
  });

  contentArea.addEventListener('click', e => {
    if (e.target.closest('#appSearchClear')) {
      e.preventDefault();
      clearSearch();
      return;
    }

    const searchLink = e.target.closest('[data-search-term]');
    if (searchLink) {
      e.preventDefault();
      e.stopPropagation();
      applySearch(searchLink.dataset.searchTerm, { scrollToTop: false, focusSearch: true });
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
    if (e.key === 'Escape') {
      const input = document.getElementById('appSearch');
      if (input && input.value) {
        e.preventDefault();
        clearSearch();
      }
      return;
    }

    if (e.key !== 'Enter' && e.key !== ' ') return;
    const searchLink = e.target.closest('[data-search-term]');
    if (!searchLink) return;
    e.preventDefault();
    applySearch(searchLink.dataset.searchTerm, { scrollToTop: false, focusSearch: true });
  });
}

function renderLoadingScreen() {
  contentArea.innerHTML = `
    <div class="portal-loading" role="status" aria-live="polite">
      <div class="portal-loading-card">
        <div class="portal-loading-logo-wrap">
          <div class="portal-loading-ring" aria-hidden="true"></div>
          <img src="${LOGO_PATH}" alt="" class="portal-loading-logo" width="56" height="56" decoding="async">
        </div>
        <p class="portal-loading-brand">${SITE_NAME}</p>
        <p class="portal-loading-message">データを読み込んでいます…</p>
        <div class="portal-loading-dots" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>
  `;
}

function renderShell() {
  contentArea.innerHTML = buildShellMarkup();
  mountShellControls();
  updateDayList();
}

function renderFatalError(err) {
  contentArea.innerHTML = `
    <div class="error-panel">
      <h2>データの読み込みに失敗しました</h2>
      <p class="error-message">メニューデータを表示できません。通信状況を確認してください。</p>
      <button type="button" id="retryLoadBtn" class="error-retry-btn">再読み込み</button>
    </div>
  `;
  document.getElementById('retryLoadBtn')?.addEventListener('click', () => {
    init();
  });
  console.error('[出数表入力]', err);
}

async function init() {
  renderLoadingScreen();
  const startedAt = Date.now();

  try {
    await loadData();

    const remaining = LOADING_MIN_MS - (Date.now() - startedAt);
    if (remaining > 0) await sleep(remaining);

    await transitionFromLoadingToShell();
  } catch (err) {
    await fadeOutLoadingOverlay();
    renderFatalError(err);
  }
}

if (window.AppAccessGate) {
  window.AppAccessGate.requireAccess(init);
} else {
  init();
}
