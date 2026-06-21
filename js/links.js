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
    orderForm: 'https://forms.gle/EFGetgC9g185UaYN7',
    manualUrl: appRoot + 'manual.html',

    /** 閲覧ゲート（API 未接続時のフォールバック PIN） */
    accessPin: '1234',
    accessGate: true,
    /** true: タブを閉じるまで再入力不要 / false: 毎回入力 */
    accessRememberSession: true,

    /** フッター（コピーライトバー） */
    credit: {
      trialLabel: 'お試し版',
      startYear: 2026,
      companyName: 'Owl Technology, inc',
      companyUrl: 'https://owl-tec.co.jp/'
    }
  };
})();
