/**
 * 閲覧ゲート（固定4桁 PIN）
 * - js/links.js の accessPin のみ（先頭の 0 もそのまま）
 * - 変更するときは links.js を編集して push
 */
(function () {
  const STORAGE_KEY = 'output-sheet-access';
  let logoutBound = false;

  function getFixedPin() {
    const links = window.AppLinks || {};
    const pin = String(links.accessPin ?? '').trim();
    if (links.accessGate === false || !/^\d{4}$/.test(pin)) return null;
    return pin;
  }

  function shouldRememberSession() {
    return window.AppLinks?.accessRememberSession !== false;
  }

  function isGateEnabled() {
    return getFixedPin() != null;
  }

  function isUnlocked() {
    if (!shouldRememberSession()) return false;
    try {
      return sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function markUnlocked() {
    if (!shouldRememberSession()) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
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

  function lockAndReload() {
    clearUnlock();
    window.location.reload();
  }

  function normalizePin(pin) {
    return String(pin || '').replace(/\D/g, '').slice(0, 4);
  }

  function verifyPin(pin) {
    const expected = getFixedPin();
    if (!expected) return true;
    return normalizePin(pin) === expected;
  }

  function renderGateMarkup() {
    const digits = [0, 1, 2, 3].map(index => `
      <input
        type="tel"
        class="access-gate-digit"
        inputmode="numeric"
        pattern="[0-9]*"
        maxlength="1"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        aria-label="パスワード ${index + 1} 桁目"
        data-digit-index="${index}"
      >
    `).join('');

    return `
      <div class="access-gate" role="dialog" aria-modal="true" aria-labelledby="accessGateTitle">
        <div class="access-gate-card">
          <img src="images/seki-logo.png" alt="" class="access-gate-logo" width="48" height="48" decoding="async">
          <h1 id="accessGateTitle" class="access-gate-title">閲覧パスワード</h1>
          <p class="access-gate-lead">4桁の数字を入力して「表示する」を押してください</p>
          <div class="access-gate-pins" id="accessGatePins">${digits}</div>
          <p id="accessGateError" class="access-gate-error" hidden>数字が違います</p>
          <button type="button" id="accessGateSubmit" class="access-gate-submit">表示する</button>
        </div>
      </div>
    `;
  }

  function bindPinInputs(container) {
    const digits = [...container.querySelectorAll('.access-gate-digit')];

    function getPinValue() {
      return digits.map(input => normalizePin(input.value)).join('');
    }

    function clearDigits() {
      digits.forEach(input => {
        input.value = '';
        input.classList.remove('access-gate-digit--filled');
      });
      digits[0]?.focus();
    }

    digits.forEach((input, index) => {
      input.addEventListener('input', () => {
        const value = normalizePin(input.value).slice(-1);
        input.value = value;
        input.classList.toggle('access-gate-digit--filled', Boolean(value));
        if (value && index < digits.length - 1) digits[index + 1].focus();
      });

      input.addEventListener('keydown', e => {
        if (e.key === 'Backspace' && !input.value && index > 0) {
          digits[index - 1].focus();
        }
      });

      input.addEventListener('paste', e => {
        e.preventDefault();
        const text = normalizePin(e.clipboardData?.getData('text') || '');
        text.split('').forEach((char, i) => {
          if (!digits[i]) return;
          digits[i].value = char;
          digits[i].classList.toggle('access-gate-digit--filled', Boolean(char));
        });
        if (text.length) digits[Math.min(text.length, digits.length - 1)]?.focus();
      });
    });

    window.setTimeout(() => digits[0]?.focus(), 80);
    return { getPinValue, clearDigits };
  }

  function mountGate(onGranted) {
    document.getElementById('accessGateMount')?.remove();

    const mount = document.createElement('div');
    mount.id = 'accessGateMount';
    mount.className = 'access-gate-host';
    mount.innerHTML = renderGateMarkup();
    document.body.appendChild(mount);

    const submitBtn = mount.querySelector('#accessGateSubmit');
    const errorEl = mount.querySelector('#accessGateError');
    const pinControls = bindPinInputs(mount.querySelector('#accessGatePins'));

    function finish() {
      mount.remove();
      onGranted();
    }

    function showError(message) {
      if (!errorEl) return;
      errorEl.textContent = message || '数字が違います';
      errorEl.hidden = false;
      mount.querySelector('.access-gate-card')?.classList.add('access-gate-card--shake');
      window.setTimeout(() => {
        mount.querySelector('.access-gate-card')?.classList.remove('access-gate-card--shake');
      }, 420);
    }

    function tryUnlock() {
      const value = pinControls.getPinValue();
      if (value.length !== 4) {
        showError('4桁すべて入力してください');
        return;
      }

      if (verifyPin(value)) {
        markUnlocked();
        finish();
        return;
      }

      showError('数字が違います');
      pinControls.clearDigits();
    }

    submitBtn?.addEventListener('click', tryUnlock);
    mount.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      if (e.target.closest('.access-gate-digit') || e.target === submitBtn) {
        e.preventDefault();
        tryUnlock();
      }
    });
  }

  function requireAccess(onGranted) {
    if (!isGateEnabled() || isUnlocked()) {
      onGranted();
      return;
    }
    mountGate(onGranted);
  }

  function bindLogoutControl() {
    if (logoutBound) return;
    logoutBound = true;

    document.addEventListener('click', e => {
      if (e.target.closest('#accessLogoutBtn')) {
        e.preventDefault();
        lockAndReload();
      }
    });
  }

  function renderFooterButtons() {
    if (!isGateEnabled() || !shouldRememberSession() || !isUnlocked()) return '';
    return '<button type="button" id="accessLogoutBtn" class="app-footer-pin-btn">ログアウト</button>';
  }

  window.AppAccessGate = {
    requireAccess,
    isUnlocked,
    clearUnlock,
    lockAndReload,
    isEnabled: isGateEnabled,
    bindSettings: bindLogoutControl,
    renderFooterButtons
  };
})();
