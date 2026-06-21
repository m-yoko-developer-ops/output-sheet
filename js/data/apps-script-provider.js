/**
 * Google Apps Script — ORDERS データ取得
 * 失敗時は data/orders.json にフォールバック
 */
window.AppsScriptProvider = {
  buildOrdersUrl(baseUrl) {
    const url = (baseUrl || '').trim();
    if (!url) throw new ArchiveLoadError('設定エラー', 'API baseUrl が未設定です');
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}type=orders`;
  },

  parseOrdersJson(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      throw new ArchiveLoadError(
        'スプレッドシート API の応答が空です',
        'Apps Script が空のレスポンスを返しました。'
      );
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
          'orders データは配列形式である必要があります。',
          { receivedType: typeof data }
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

  fetchOrdersJsonp(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      const callbackName = `_gasOrdersCb_${Date.now()}`;
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
          reject(new ArchiveLoadError(
            'スプレッドシート API の応答が不正です',
            'JSONP 応答が配列ではありません。'
          ));
          return;
        }
        resolve(data);
      };

      script.onerror = () => {
        cleanup();
        reject(new ArchiveLoadError(
          'スプレッドシート API（JSONP）に接続できません',
          'JSONP 読み込みに失敗しました。',
          { url }
        ));
      };

      timer = setTimeout(() => {
        cleanup();
        reject(new ArchiveLoadError(
          'スプレッドシート API がタイムアウトしました',
          `${timeoutMs / 1000} 秒以内に応答がありませんでした。`,
          { url }
        ));
      }, timeoutMs);

      script.src = `${url}${separator}callback=${callbackName}`;
      document.head.appendChild(script);
    });
  },

  async fetchOrdersDirect(url, timeoutMs) {
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

      return this.parseOrdersJson(await res.text());
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new ArchiveLoadError(
          'スプレッドシート API がタイムアウトしました',
          `${timeoutMs / 1000} 秒以内に応答がありませんでした。`,
          { url }
        );
      }
      if (err instanceof ArchiveLoadError) throw err;
      throw new ArchiveLoadError(
        'スプレッドシート API に接続できません',
        'CORS またはネットワークエラー。JSONP にフォールバックします。',
        { url, cause: err.message }
      );
    } finally {
      clearTimeout(timer);
    }
  },

  async fetchOrders(baseUrl) {
    const url = this.buildOrdersUrl(baseUrl);
    const timeoutMs = window.AppConfig?.api?.timeoutMs || 30000;

    try {
      return await this.fetchOrdersDirect(url, timeoutMs);
    } catch (fetchErr) {
      return await this.fetchOrdersJsonp(url, timeoutMs);
    }
  },

  async loadOrdersFromJson(jsonConfig) {
    const base = (jsonConfig?.basePath || 'data').replace(/\/$/, '');
    const url = `${base}/orders.json`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      throw new ArchiveLoadError(
        'ローカル orders データの読み込みに失敗しました',
        `orders.json — HTTP ${res.status}`,
        { url, status: res.status }
      );
    }
    const data = await res.json();
    return data.orders || [];
  },

  async loadOrders(apiConfig, jsonConfig) {
    if (!apiConfig?.baseUrl) {
      const orders = await this.loadOrdersFromJson(jsonConfig);
      return {
        orders,
        source: 'json',
        notice: {
          level: 'warning',
          title: 'API 未設定',
          message: 'GAS URL が未設定のため、サンプル JSON（orders.json）を表示しています。'
        }
      };
    }

    try {
      const orders = await this.fetchOrders(apiConfig.baseUrl);
      const notice = orders.length === 0
        ? {
            level: 'warning',
            title: '出数データなし',
            message: 'ORDERS シートにデータがありません。rebuildOrdersFromFormResponses を実行してください。'
          }
        : null;

      return { orders, source: 'api', notice };
    } catch (apiErr) {
      const orders = await this.loadOrdersFromJson(jsonConfig);
      return {
        orders,
        source: 'json-fallback',
        notice: {
          level: 'error',
          title: apiErr.title || 'スプレッドシートから出数を取得できませんでした',
          message: apiErr.message,
          fallback: `サンプル JSON の ${orders.length} 件を表示しています。`
        }
      };
    }
  }
};
