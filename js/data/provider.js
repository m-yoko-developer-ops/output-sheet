/**
 * データ取得の統一入口
 */
window.loadOutputData = async function loadOutputData() {
  const jsonConfig = window.AppConfig?.json || { basePath: 'data' };
  const raw = await window.JsonDataProvider.load(jsonConfig);
  const data = window.OutputNormalize.normalizeData(raw);
  const indexes = window.OutputNormalize.buildIndexes(data);

  return {
    data,
    indexes,
    meta: { source: 'json', notices: [] }
  };
};
