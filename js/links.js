/**
 * 外部リンク（フォーム URL 等）
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

  window.AppLinks = {
    publicSite: 'https://m-yoko-developer-ops.github.io/output-sheet/',
    orderForm: 'https://forms.gle/EFGetgC9g185UaYN7'
  };
})();
