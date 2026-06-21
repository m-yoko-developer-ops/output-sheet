/**
 * Google Apps Script — 日付別メニュー取得
 * 失敗時は data/menus.json にフォールバック
 */
window.AppsScriptProvider = {
  buildMenusUrl(baseUrl) {
    const url = (baseUrl || '').trim();
    if (!url) throw new ArchiveLoadError('設定エラー', 'API baseUrl が未設定です');
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}type=menus`;
  },

  parseMenusJson(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      throw new ArchiveLoadError('スプレッドシート API の応答が空です', 'Apps Script が空のレスポンスを返しました。');
    }
    if (trimmed.startsWith('<')) {
      throw new ArchiveLoadError(
        'スプレッドシート API の応答が不正です',
        'HTML が返されました。ウェブアプリの公開設定（アクセス: 全員）を確認してください。',
        { preview: trimmed.slice(0, 120) }
      );
    }
    try {
      const data = JSON.parse(trimmed);
      if (!Array.isArray(data)) {
        throw new ArchiveLoadError(
          'スプレッドシート API の応答が不正です',
          'menus データは配列形式である必要があります。'
        );
      }
      return data;
    } catch (err) {
      if (err instanceof ArchiveLoadError) throw err;
      throw new ArchiveLoadError(
        'スプレッドシート API の応答が不正です',
        'JSON として解析できませんでした。',
        { cause: err.message, preview: trimmed.slice(0, 120) }
      );
    }
  },

  fetchMenusJsonp(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      const callbackName = `_gasMenusCb_${Date.now()}`;
      const separator = url.includes('?') ? '&' : '?';
      const script = document.createElement('script');
      let timer;

      function cleanup() {
        clearTimeout(timer);
        delete window[callbackName];
        script.remove();
      }

      window[callbackName] = (data) => {
        cleanup();
        if (!Array.isArray(data)) {
          reject(new ArchiveLoadError('スプレッドシート API の応答が不正です', 'JSONP 応答が配列ではありません。'));
          return;
        }
        resolve(data);
      };

      script.onerror = () => {
        cleanup();
        reject(new ArchiveLoadError('スプレッドシート API（JSONP）に接続できません', 'JSONP 読み込みに失敗しました。', { url }));
      };

      timer = setTimeout(() => {
        cleanup();
        reject(new ArchiveLoadError('スプレッドシート API がタイムアウトしました', `${timeoutMs / 1000} 秒以内に応答がありませんでした。`, { url }));
      }, timeoutMs);

      script.src = `${url}${separator}callback=${callbackName}`;
      document.head.appendChild(script);
    });
  },

  async fetchMenusDirect(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        cache: 'no-store',
        signal: controller.signal
      });

      if (!res.ok) {
        throw new ArchiveLoadError(
          'スプレッドシート API がエラーを返しました',
          `HTTP ${res.status}: ${res.statusText}`,
          { url, status: res.status }
        );
      }

      return this.parseMenusJson(await res.text());
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new ArchiveLoadError('スプレッドシート API がタイムアウトしました', `${timeoutMs / 1000} 秒以内に応答がありませんでした。`, { url });
      }
      if (err instanceof ArchiveLoadError) throw err;
      throw new ArchiveLoadError('スプレッドシート API に接続できません', 'CORS またはネットワークエラー。', { url, cause: err.message });
    } finally {
      clearTimeout(timer);
    }
  },

  async fetchMenus(baseUrl) {
    const url = this.buildMenusUrl(baseUrl);
    const timeoutMs = window.AppConfig?.api?.timeoutMs || 30000;

    try {
      return await this.fetchMenusDirect(url, timeoutMs);
    } catch (fetchErr) {
      return await this.fetchMenusJsonp(url, timeoutMs);
    }
  },

  async loadMenusFromJson(jsonConfig) {
    const base = (jsonConfig?.basePath || 'data').replace(/\/$/, '');
    const url = `${base}/menus.json`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      throw new ArchiveLoadError('ローカル menus データの読み込みに失敗しました', `menus.json — HTTP ${res.status}`, { url, status: res.status });
    }
    const data = await res.json();
    return data.menus || [];
  },

  async loadMenus(apiConfig, jsonConfig) {
    if (!apiConfig?.baseUrl) {
      const menus = await this.loadMenusFromJson(jsonConfig);
      return {
        menus,
        source: 'json',
        notice: {
          level: 'warning',
          title: 'API 未設定',
          message: 'GAS URL が未設定のため、サンプル JSON（menus.json）を表示しています。'
        }
      };
    }

    try {
      const menus = await this.fetchMenus(apiConfig.baseUrl);
      const notice = menus.length === 0
        ? {
            level: 'warning',
            title: 'メニューデータなし',
            message: 'スプレッドシートに日付行がありません。1行目に「日付」列があるか確認してください。'
          }
        : null;

      return { menus, source: 'api', notice };
    } catch (apiErr) {
      const menus = await this.loadMenusFromJson(jsonConfig);
      return {
        menus,
        source: 'json-fallback',
        notice: {
          level: 'error',
          title: apiErr.title || 'スプレッドシートからメニューを取得できませんでした',
          message: apiErr.message,
          fallback: `サンプル JSON の ${menus.length} 件を表示しています。`
        }
      };
    }
  }
};
