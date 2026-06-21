/**
 * データ取得の統一入口
 * menus: スプレッドシート（Apps Script API）→ 失敗時 menus.json
 */
window.loadOutputData = async function loadOutputData() {
  const jsonConfig = window.AppConfig?.json || { basePath: 'data' };
  const apiConfig = window.AppConfig?.api;

  const jsonData = await window.JsonDataProvider.load(jsonConfig);
  const menuResult = await window.AppsScriptProvider.loadMenus(apiConfig, jsonConfig);

  const notices = [];
  if (menuResult.notice) notices.push(menuResult.notice);

  const raw = {
    ...jsonData,
    menus: menuResult.menus
  };

  const data = window.OutputNormalize.normalizeData(raw);
  const indexes = window.OutputNormalize.buildIndexes(data);

  return {
    data,
    indexes,
    meta: {
      menuSource: menuResult.source,
      notices
    }
  };
};
