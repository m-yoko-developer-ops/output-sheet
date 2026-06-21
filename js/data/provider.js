/**
 * データ取得の統一入口
 * ORDERS: スプレッドシート（Apps Script API）→ 失敗時 orders.json
 * その他: ローカル JSON
 */
window.loadOutputData = async function loadOutputData() {
  const jsonConfig = window.AppConfig?.json || { basePath: 'data' };
  const apiConfig = window.AppConfig?.api;

  const jsonData = await window.JsonDataProvider.load(jsonConfig);
  const orderResult = await window.AppsScriptProvider.loadOrders(apiConfig, jsonConfig);

  const notices = [];
  if (orderResult.notice) notices.push(orderResult.notice);

  const raw = {
    ...jsonData,
    orders: orderResult.orders
  };

  const data = window.OutputNormalize.normalizeData(raw);
  const indexes = window.OutputNormalize.buildIndexes(data);

  return {
    data,
    indexes,
    meta: {
      orderSource: orderResult.source,
      notices
    }
  };
};
