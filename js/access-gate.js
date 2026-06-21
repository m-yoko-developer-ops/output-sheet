/**
 * 閲覧ゲート（4桁 PIN）
 * - PIN は GAS / スプレッドシート「設定」シートで管理（サイトから変更可）
 * - links.js の accessPin は API 未接続時のフォールバック
 */
(function () {
  const STORAGE_KEY = 'output-sheet-access';
  let remoteEnabled = null;
  let settingsBound = false;

  function getLocalConfig() {
    const links = window.AppLinks || {};
    const pin = String(links.accessPin ?? '').trim();
    const enabled = links.accessGate !== false && /^\d{4}$/.test(pin);
    return { enabled, pin };
  }

  function getApiBaseUrl() {
    return String(window.AppConfig?.api?.baseUrl || '').trim();
  }

  function buildAccessUrl(params) {
    const base = getApiBaseUrl();
    if (!base) return '';
    const qs = new URLSearchParams({ type: 'access', ...params });
    const join = base.includes('?') ? '&' : '?';
    return `${base}${join}${qs.toString()}`;
  }

  async function fetchAccessJson(params) {
    const url = buildAccessUrl(params);
    if (!url) return null;

    const timeoutMs = window.AppConfig?.api?.timeoutMs || 30000;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        cache: 'no-store',
        signal: controller.signal
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function loadRemoteStatus() {
    const data = await fetchAccessJson({ action: 'status' });
    if (data && typeof data.enabled === 'boolean') {
      remoteEnabled = data.enabled;
      return data;
    }
    return null;
  }

  async function isGateEnabled() {
    if (window.AppLinks?.accessGate === false) return false;
    const local = getLocalConfig();
    if (!getApiBaseUrl()) return local.enabled;

    if (remoteEnabled == null) {
      const status = await loadRemoteStatus();
      if (status) return status.enabled;
    }
    if (remoteEnabled != null) return remoteEnabled;

    return local.enabled;
  }

  function isUnlocked() {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function markUnlocked() {
    try {
      sessionStorage.setItem(STORAGE_KEY, '1';
    } catch {
      /* ignore */
    }
  }

  function clearUnlock() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  async function verifyPin(pin) {
    const value = String(pin || '').replace(/\D/g, '').slice(0, 4);
    if (value.length !== 4) return false;

    const data = await fetchAccessJson({ action: 'verify', pin: value });
    if (data && typeof data.ok === 'boolean') return data.ok;

    const local = getLocalConfig();
    return local.enabled ? value === local.pin : true;
  }

  async function changePin(current, next) {
    const cur = String(current || '').replace(/\D/g, '').slice(0, 4);
    const nxt = String(next || '').replace(/\D/g, '').slice(0, 4);
    if (cur.length !== 4 || nxt.length !== 4) {
      return { ok: false, error: 'invalid_format' };
    }

    const data = await fetchAccessJson({ action: 'change', current: cur, next: nxt });
    if (data && data.ok) return { ok: true };
    if (data && data.error) return data;

    return { ok: false, error: 'api_unavailable' };
  }

  function renderGateMarkup() {
    return `
      <div class="access-gate" role="dialog" aria-modal="true" aria-labelledby="accessGateTitle">
        <div class="access-gate-card">
          <img src="images/seki-logo.png" alt="" class="access-gate-logo" width="48" height="48" decoding="async">
          <h1 id="accessGateTitle" class="access-gate-title">閲覧パスワード</h1>
          <p class="access-gate-lead">4桁の数字を入力してください</p>
          <div class="access-gate-input-row">
            <input
              type="password"
              id="accessGateInput"
              class="access-gate-input"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="4"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              aria-label="4桁の閲覧パスワード"
            >
          </div>
          <p id="accessGateError" class="access-gate-error" hidden>数字が違います</p>
          <button type="button" id="accessGateSubmit" class="access-gate-submit">表示する</button>
        </div>
      </div>
    `;
  }

  function mountGate(host, onGranted) {
    host.querySelector('#accessGateMount')?.remove();

    const mount = document.createElement('div');
    mount.id = 'accessGateMount';
    if (host === document.body) mount.className = 'access-gate-host';
    mount.innerHTML = renderGateMarkup();
    host.appendChild(mount);

    const input = mount.querySelector('#accessGateInput');
    const submitBtn = mount.querySelector('#accessGateSubmit');
    const errorEl = mount.querySelector('#accessGateError');
    let busy = false;

    function finish() {
      mount.remove();
      onGranted();
    }

    function showError(message) {
      if (!errorEl || !input) return;
      errorEl.textContent = message || '数字が違います';
      errorEl.hidden = false;
      input.classList.add('access-gate-input--error');
      input.select();
      mount.querySelector('.access-gate-card')?.classList.add('access-gate-card--shake');
      window.setTimeout(() => {
        mount.querySelector('.access-gate-card')?.classList.remove('access-gate-card--shake');
      }, 420);
    }

    function clearError() {
      if (!errorEl || !input) return;
      errorEl.hidden = true;
      input.classList.remove('access-gate-input--error');
    }

    async function tryUnlock() {
      if (!input || busy) return;
      const value = input.value.replace(/\D/g, '').slice(0, 4);
      input.value = value;
      if (value.length !== 4) return;

      busy = true;
      submitBtn.disabled = true;

      try {
        const ok = await verifyPin(value);
        if (ok) {
          markUnlocked();
          finish();
          return;
        }
        showError('数字が違います');
      } finally {
        busy = false;
        submitBtn.disabled = false;
      }
    }

    submitBtn?.addEventListener('click', tryUnlock);
    input?.addEventListener('input', () => {
      clearError();
      if ((input.value || '').length >= 4) tryUnlock();
    });
    input?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        tryUnlock();
      }
    });

    window.setTimeout(() => input?.focus(), 60);
  }

  async function requireAccess(onGranted) {
    const enabled = await isGateEnabled();
    if (!enabled || isUnlocked()) {
      onGranted();
      return;
    }

    const host = document.getElementById('contentArea') || document.body;
    mountGate(host, onGranted);
  }

  function renderSettingsModal() {
    return `
      <div id="accessSettingsModal" class="access-settings" hidden>
        <div class="access-settings-backdrop" data-close-access-settings></div>
        <div class="access-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="accessSettingsTitle">
          <h2 id="accessSettingsTitle" class="access-settings-title">閲覧パスワードの変更</h2>
          <p class="access-settings-lead">新しい4桁の数字を設定します。スプレッドシートの「設定」シートにも保存されます。</p>
          <label class="access-settings-field">
            <span>現在のパスワード</span>
            <input type="password" id="accessSettingsCurrent" class="access-gate-input" inputmode="numeric" maxlength="4" autocomplete="off">
          </label>
          <label class="access-settings-field">
            <span>新しいパスワード</span>
            <input type="password" id="accessSettingsNext" class="access-gate-input" inputmode="numeric" maxlength="4" autocomplete="off">
          </label>
          <label class="access-settings-field">
            <span>新しいパスワード（確認）</span>
            <input type="password" id="accessSettingsConfirm" class="access-gate-input" inputmode="numeric" maxlength="4" autocomplete="off">
          </label>
          <p id="accessSettingsMessage" class="access-settings-message" hidden></p>
          <div class="access-settings-actions">
            <button type="button" class="home-manual-btn" data-close-access-settings>キャンセル</button>
            <button type="button" id="accessSettingsSave" class="access-gate-submit access-gate-submit--inline">保存する</button>
          </div>
        </div>
      </div>
    `;
  }

  function ensureSettingsModal() {
    if (document.getElementById('accessSettingsModal')) return;

    const wrap = document.createElement('div');
    wrap.innerHTML = renderSettingsModal();
    document.body.appendChild(wrap.firstElementChild);
  }

  function openSettings() {
    if (!getApiBaseUrl()) {
      window.alert('API が未設定のため、サイトから PIN を変更できません。\nスプレッドシートの「設定」シートか js/links.js を編集してください。');
      return;
    }

    ensureSettingsModal();
    const modal = document.getElementById('accessSettingsModal');
    if (!modal) return;

    modal.hidden = false;
    modal.querySelector('#accessSettingsCurrent')?.focus();

    const msg = modal.querySelector('#accessSettingsMessage');
    if (msg) msg.hidden = true;
  }

  function closeSettings() {
    const modal = document.getElementById('accessSettingsModal');
    if (!modal) return;
    modal.hidden = true;
    ['accessSettingsCurrent', 'accessSettingsNext', 'accessSettingsConfirm'].forEach(id => {
      const el = modal.querySelector('#' + id);
      if (el) el.value = '';
    });
  }

  function bindSettingsControls() {
    if (settingsBound) return;
    settingsBound = true;

    ensureSettingsModal();

    document.addEventListener('click', async e => {
      if (e.target.closest('#accessSettingsBtn')) {
        e.preventDefault();
        openSettings();
        return;
      }

      if (e.target.closest('[data-close-access-settings]')) {
        e.preventDefault();
        closeSettings();
        return;
      }

      if (!e.target.closest('#accessSettingsSave')) return;

      e.preventDefault();
      const modal = document.getElementById('accessSettingsModal');
      if (!modal) return;

      const current = modal.querySelector('#accessSettingsCurrent')?.value || '';
      const next = modal.querySelector('#accessSettingsNext')?.value || '';
      const confirm = modal.querySelector('#accessSettingsConfirm')?.value || '';
      const msg = modal.querySelector('#accessSettingsMessage');
      const saveBtn = modal.querySelector('#accessSettingsSave');

      const showMsg = (text, isError) => {
        if (!msg) return;
        msg.textContent = text;
        msg.hidden = false;
        msg.classList.toggle('access-settings-message--error', !!isError);
        msg.classList.toggle('access-settings-message--ok', !isError);
      };

      if (next !== confirm) {
        showMsg('新しいパスワードが一致しません', true);
        return;
      }

      saveBtn.disabled = true;
      const result = await changePin(current, next);
      saveBtn.disabled = false;

      if (result.ok) {
        showMsg('変更しました。次回から新しい番号を使います。', false);
        window.setTimeout(closeSettings, 1200);
        return;
      }

      if (result.error === 'wrong_current') {
        showMsg('現在のパスワードが違います', true);
        return;
      }
      if (result.error === 'invalid_format') {
        showMsg('4桁の数字を入力してください', true);
        return;
      }
      showMsg('変更できませんでした。GAS の再デプロイを確認してください。', true);
    });
  }

  function renderSettingsButton() {
    if (!getApiBaseUrl() || window.AppLinks?.accessGate === false) return '';
    return `<button type="button" id="accessSettingsBtn" class="app-footer-pin-btn">PIN変更</button>`;
  }

  window.AppAccessGate = {
    requireAccess,
    isUnlocked,
    clearUnlock,
    isEnabled: isGateEnabled,
    bindSettings: bindSettingsControls,
    renderSettingsButton
  };
})();
