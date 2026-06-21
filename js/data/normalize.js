/**
 * JSON をサイト共通モデルへ正規化
 */
window.OutputNormalize = (function () {
  const MENU_KEYS = ['daily', 'health', 'recommend', 'noodle', 'budget'];

  function formatMenuDate(value) {
    if (!value) return '';
    if (value instanceof Date) {
      const y = value.getFullYear();
      const m = String(value.getMonth() + 1).padStart(2, '0');
      const d = String(value.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const text = String(value).trim();
    const m = text.match(/(\d{4})[\/\-年.](\d{1,2})[\/\-月.](\d{1,2})/);
    if (m) {
      return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
    }
    return text;
  }

  function normalizeImages(item) {
    if (Array.isArray(item.images)) {
      return item.images.map(String).filter(Boolean);
    }
    const images = [];
    ['image1', 'image2', 'image3', 'image_1', 'image_2', 'image_3'].forEach(key => {
      if (item[key]) images.push(String(item[key]));
    });
    return images;
  }

  function normalizeMenu(raw) {
    const item = raw || {};
    const menuDate = formatMenuDate(item.menuDate || item.menu_date || item.date || item.日付);
    const menus = {
      daily: String(item.daily || item.dailyMenu || item.日替わり || ''),
      health: String(item.health || item.healthMenu || item.健康 || ''),
      recommend: String(item.recommend || item.recommendMenu || item.おすすめ || ''),
      noodle: String(item.noodle || item.noodleMenu || item.麺ランチ || item.麵ランチ || ''),
      budget: String(item.budget || item.budgetMenu || item.おてごろ || item.お手頃 || '')
    };

    return {
      id: String(item.id || `menu-${menuDate}`),
      menuDate,
      assignee: String(item.assignee || item.input_by || item.入力者 || ''),
      menus,
      notes: String(item.notes || item.memo || item.備考 || ''),
      images: normalizeImages(item)
    };
  }

  function normalizeClient(raw) {
    const item = raw || {};
    return {
      id: String(item.id || ''),
      name: String(item.name || ''),
      contact: String(item.contact || ''),
      phone: String(item.phone || ''),
      email: String(item.email || ''),
      notes: String(item.notes || '')
    };
  }

  function normalizeProduct(raw) {
    const item = raw || {};
    return {
      id: String(item.id || ''),
      name: String(item.name || ''),
      category: String(item.category || ''),
      defaultUnit: String(item.defaultUnit || item.default_unit || '食'),
      notes: String(item.notes || '')
    };
  }

  function normalizeData(raw) {
    return {
      menus: (raw.menus || []).map(normalizeMenu).filter(m => m.menuDate),
      clients: (raw.clients || []).map(normalizeClient).filter(c => c.id),
      products: (raw.products || []).map(normalizeProduct).filter(p => p.id)
    };
  }

  function buildIndexes(data) {
    const menuById = new Map();
    const menuByDate = new Map();
    const clientById = new Map();
    const productById = new Map();

    data.menus.forEach(menu => {
      menuById.set(menu.id, menu);
      menuByDate.set(menu.menuDate, menu);
    });

    data.clients.forEach(client => clientById.set(client.id, client));
    data.products.forEach(product => productById.set(product.id, product));

    return {
      menuById,
      menuByDate,
      clientById,
      productById
    };
  }

  return {
    MENU_KEYS,
    normalizeData,
    buildIndexes,
    normalizeMenu
  };
})();
