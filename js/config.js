/**
 * 出数管理表 — アプリ設定
 */
(function () {
  function getAppRoot() {
    let path = window.location.pathname;
    if (path.endsWith('index.html') || path.endsWith('admin.html')) {
      path = path.replace(/[^/]+$/, '');
    }
    if (!path.endsWith('/')) {
      const slash = path.lastIndexOf('/');
      path = slash >= 0 ? path.slice(0, slash + 1) : '/';
    }
    return path;
  }

  const appRoot = getAppRoot();

  window.AppConfig = {
    appRoot,

    /** GAS ウェブアプリ URL */
    api: {
      baseUrl: 'https://script.google.com/macros/s/AKfycbxMHl7OJ4kvmGfQKZqd92-rzQMMcDsIjlxZ1E7gCyL5xf285JcD2IkGcykQTy5w5Npf/exec',
      timeoutMs: 30000
    },

    json: {
      basePath: appRoot + 'data'
    }
  };
})();
