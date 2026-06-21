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

    /** Google Apps Script（将来のスプレッドシート連携用） */
    api: {
      baseUrl: ''
    },

    json: {
      basePath: appRoot + 'data'
    }
  };
})();
