/**
 * JSON をサイト共通モデルへ正規化
 */
window.OutputNormalize = (function () {
  const STATUS_MAP = {
    '未着手': 'pending',
    '製作中': 'in_progress',
    '進行中': 'in_progress',
    '完了': 'done',
    'キャンセル': 'cancelled',
    pending: 'pending',
    in_progress: 'in_progress',
    done: 'done',
    cancelled: 'cancelled'
  };

  function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeOrder(raw) {
    const item = raw || {};
    return {
      id: String(item.id || ''),
      orderNo: String(item.orderNo || item.order_no || ''),
      title: String(item.title || item.name || '無題'),
      clientId: String(item.clientId || item.client_id || ''),
      productId: String(item.productId || item.product_id || ''),
      productName: String(item.productName || item.product_name || item.product || ''),
      quantity: toNumber(item.quantity ?? item.qty),
      unit: String(item.unit || '部'),
      dueDate: String(item.dueDate || item.due_date || ''),
      status: STATUS_MAP[item.status] || 'pending',
      assignee: String(item.assignee || item.staff || ''),
      spec: String(item.spec || item.specification || ''),
      notes: String(item.notes || item.memo || '')
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
      defaultUnit: String(item.defaultUnit || item.default_unit || '部'),
      notes: String(item.notes || '')
    };
  }

  function normalizeData(raw) {
    return {
      orders: (raw.orders || []).map(normalizeOrder).filter(o => o.id),
      clients: (raw.clients || []).map(normalizeClient).filter(c => c.id),
      products: (raw.products || []).map(normalizeProduct).filter(p => p.id)
    };
  }

  function buildIndexes(data) {
    const orderById = new Map();
    const clientById = new Map();
    const productById = new Map();
    const ordersByClientId = new Map();
    const ordersByProductId = new Map();

    data.clients.forEach(client => clientById.set(client.id, client));
    data.products.forEach(product => productById.set(product.id, product));

    data.orders.forEach(order => {
      orderById.set(order.id, order);
      if (order.clientId) {
        const list = ordersByClientId.get(order.clientId) || [];
        list.push(order);
        ordersByClientId.set(order.clientId, list);
      }
      if (order.productId) {
        const list = ordersByProductId.get(order.productId) || [];
        list.push(order);
        ordersByProductId.set(order.productId, list);
      }
    });

    return {
      orderById,
      clientById,
      productById,
      ordersByClientId,
      ordersByProductId
    };
  }

  return {
    normalizeData,
    buildIndexes
  };
})();
