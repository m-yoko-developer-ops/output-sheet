/**
 * ローカル JSON — 案件・取引先・品目
 */
window.JsonDataProvider = {
  async fetchJson(base, file) {
    const url = `${base}/${file}`;
    let res;
    try {
      res = await fetch(url);
    } catch (networkErr) {
      throw new ArchiveLoadError(
        `${file} に接続できません`,
        `ネットワークエラー（${url}）`,
        { url, cause: networkErr.message }
      );
    }
    if (!res.ok) {
      throw new ArchiveLoadError(
        `${file} の読み込みに失敗しました`,
        `HTTP ${res.status}: ${res.statusText}`,
        { url, status: res.status }
      );
    }
    try {
      return await res.json();
    } catch (parseErr) {
      throw new ArchiveLoadError(
        `${file} の形式が不正です`,
        'JSON として解析できませんでした。',
        { url, cause: parseErr.message }
      );
    }
  },

  async load(config) {
    const base = (config?.basePath || 'data').replace(/\/$/, '');
    const [orders, clients, products] = await Promise.all([
      this.fetchJson(base, 'orders.json'),
      this.fetchJson(base, 'clients.json'),
      this.fetchJson(base, 'products.json')
    ]);

    return {
      orders: orders.orders || [],
      clients: clients.clients || [],
      products: products.products || []
    };
  }
};
