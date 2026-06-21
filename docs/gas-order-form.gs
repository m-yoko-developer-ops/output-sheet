/**
 * 出数表入力 — フォーム → ORDERS シート → 公開 API
 *
 * セットアップ:
 * 1. フォームに紐づくスプレッドシートで Apps Script を開く
 * 2. このファイルを Code.gs に貼り付け
 * 3. rebuildOrdersFromFormResponses を1回実行（既存840件を取り込み）
 * 4. トリガー: フォーム送信時 → onFormSubmit
 * 5. デプロイ → ウェブアプリ → アクセス: 全員 → URL を js/config.js に設定
 */

function getAnswers_(response) {
  const answers = {};
  response.getItemResponses().forEach(itemResponse => {
    const title = normalizeTitle_(itemResponse.getItem().getTitle());
    answers[title] = itemResponse.getResponse();
  });
  return answers;
}

function normalizeTitle_(title) {
  return String(title)
    .replace(/^[0-9０-９]+[.．、\s]*/, '')
    .trim();
}

function pickAnswer_(answers, ...keys) {
  for (const key of keys) {
    if (answers[key] != null && String(answers[key]).trim() !== '') {
      return answers[key];
    }
  }
  return '';
}

function getOrderHeaders_() {
  return [
    'id',
    'menu_date',
    'assignee',
    'category',
    'title',
    'quantity',
    'unit',
    'edit_url',
    'form_response_id',
    'created_at',
    'updated_at'
  ];
}

function ensureOrderHeader_(sheet) {
  const headers = getOrderHeaders_();
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const firstRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const isEmpty = firstRow.every(value => value === '');

  if (isEmpty) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return headers;
  }

  const present = new Set(firstRow.map(h => String(h).trim()).filter(Boolean));
  headers.forEach(name => {
    if (!present.has(name)) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(name);
      present.add(name);
    }
  });

  return sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0]
    .map(h => String(h).trim())
    .filter(Boolean);
}

function getOrCreateSheet_(ss, sheetName) {
  return ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
}

function getSpreadsheetId_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SPREADSHEET_ID');
  if (id) return id;

  const form = FormApp.getActiveForm();
  if (form) id = form.getDestinationId();

  if (!id) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) id = ss.getId();
  }

  if (!id) {
    throw new Error('スプレッドシート ID を取得できません。スプレッドシートから Apps Script を開いて setupSpreadsheetId を1回実行してください。');
  }

  props.setProperty('SPREADSHEET_ID', id);
  return id;
}

/** 初回セットアップ用 — スプレッドシートから Apps Script を開いて1回実行 */
function setupSpreadsheetId() {
  const id = getSpreadsheetId_();
  return 'SPREADSHEET_ID を保存しました: ' + id;
}

function getFormSpreadsheet_() {
  return SpreadsheetApp.openById(getSpreadsheetId_());
}

function getFormResponseSheet_(ss) {
  const sheets = ss.getSheets();
  const preferred = sheets.find(s => /^フォームの回答/i.test(s.getName()))
    || sheets.find(s => /^Form Responses/i.test(s.getName()));
  return preferred || sheets[0];
}

function formatMenuDate_(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy-MM-dd');
  }
  const text = String(value).trim();
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, 'Asia/Tokyo', 'yyyy-MM-dd');
  }
  const m = text.match(/(\d{4})[\/\-年.](\d{1,2})[\/\-月.](\d{1,2})/);
  if (m) {
    return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  }
  return text;
}

function parseQuantity_(value) {
  if (value === '' || value == null) return null;
  if (Array.isArray(value)) value = value[0];
  const n = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

var CATEGORY_RULES_ = [
  { match: /日替わり|日替|デイリー/i, category: 'daily' },
  { match: /^健康|健康/i, category: 'health' },
  { match: /おすすめ|オススメ/i, category: 'recommend' },
  { match: /麺|ラーメン|ランチ/i, category: 'noodle' },
  { match: /おてごろ|手ごろ|テイク/i, category: 'budget' }
];

var SKIP_HEADERS_ = [
  /^タイムスタンプ$/i,
  /^時刻$/i,
  /^日付$/i,
  /^入力者$/i,
  /^メール/i,
  /^edit[_\s]?url$/i
];

function inferCategoryAndTitle_(header) {
  const text = String(header).trim();
  for (let i = 0; i < CATEGORY_RULES_.length; i++) {
    const rule = CATEGORY_RULES_[i];
    if (rule.match.test(text)) {
      const title = text
        .replace(rule.match, '')
        .replace(/^[：:｜|／/\s-]+/, '')
        .trim();
      return {
        category: rule.category,
        title: title || text
      };
    }
  }
  return { category: 'daily', title: text };
}

function shouldSkipHeader_(header) {
  return SKIP_HEADERS_.some(re => re.test(String(header).trim()));
}

function buildOrdersFromFormRow_(headers, row, meta) {
  const orders = [];
  const headerIndex = {};
  headers.forEach((h, i) => { headerIndex[String(h).trim()] = i; });

  const dateCol = headerIndex['日付'];
  const assigneeCol = headerIndex['入力者'];
  const menuDate = formatMenuDate_(dateCol != null ? row[dateCol] : meta.menuDate);
  const assignee = assigneeCol != null ? String(row[assigneeCol] || '').trim() : meta.assignee;

  headers.forEach((header, colIndex) => {
    if (shouldSkipHeader_(header)) return;
    const qty = parseQuantity_(row[colIndex]);
    if (qty == null) return;

    const inferred = inferCategoryAndTitle_(header);
    orders.push({
      id: meta.idPrefix + '_' + colIndex,
      menu_date: menuDate,
      assignee: assignee,
      category: inferred.category,
      title: inferred.title,
      quantity: qty,
      unit: '食',
      edit_url: meta.editUrl || '',
      form_response_id: meta.formResponseId || '',
      created_at: meta.createdAt || new Date(),
      updated_at: new Date()
    });
  });

  return orders;
}

function buildOrdersFromFormAnswers_(answers, response) {
  const ss = getFormSpreadsheet_();
  const responseSheet = getFormResponseSheet_(ss);
  const headers = responseSheet.getRange(1, 1, 1, responseSheet.getLastColumn()).getValues()[0]
    .map(h => String(h).trim());

  const row = headers.map(header => {
    if (/タイムスタンプ/i.test(header)) return response.getTimestamp();
    return pickAnswer_(answers, header);
  });

  return buildOrdersFromFormRow_(headers, row, {
    idPrefix: 'ord_' + String(response.getId()).slice(0, 12),
    editUrl: response.getEditResponseUrl(),
    formResponseId: response.getId(),
    createdAt: response.getTimestamp()
  });
}

function appendOrderRows_(sheet, headers, orders) {
  if (!orders.length) return 0;
  const rows = orders.map(order => headers.map(h => order[h] ?? ''));
  sheet.getRange(sheet.getLastRow() + 1, 1, sheet.getLastRow() + rows.length, headers.length)
    .setValues(rows);
  return rows.length;
}

function removeOrdersByResponseId_(sheet, headers, formResponseId) {
  if (!formResponseId) return;
  const idCol = headers.indexOf('form_response_id');
  if (idCol < 0) return;

  const values = sheet.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][idCol]).trim() === String(formResponseId).trim()) {
      sheet.deleteRow(i + 1);
    }
  }
}

/**
 * フォーム送信トリガーに設定
 */
function onFormSubmit(e) {
  const ss = e && e.source
    ? SpreadsheetApp.openById(e.source.getDestinationId())
    : getFormSpreadsheet_();
  const sheet = getOrCreateSheet_(ss, 'ORDERS');
  const headers = ensureOrderHeader_(sheet);
  const response = e.response;
  const answers = getAnswers_(response);
  const orders = buildOrdersFromFormAnswers_(answers, response);

  removeOrdersByResponseId_(sheet, headers, response.getId());
  appendOrderRows_(sheet, headers, orders);
}

/**
 * 既存のフォーム回答（840件など）を ORDERS に一括取り込み — 初回1回
 */
function rebuildOrdersFromFormResponses() {
  const ss = getFormSpreadsheet_();
  const responseSheet = getFormResponseSheet_(ss);
  const orderSheet = getOrCreateSheet_(ss, 'ORDERS');
  const headers = ensureOrderHeader_(orderSheet);

  const lastRow = responseSheet.getLastRow();
  if (lastRow <= 1) {
    return 'フォーム回答シートにデータがありません';
  }

  const width = responseSheet.getLastColumn();
  const formHeaders = responseSheet.getRange(1, 1, 1, width).getValues()[0]
    .map(h => String(h).trim());
  const values = responseSheet.getRange(2, 1, lastRow - 1, width).getValues();

  if (orderSheet.getLastRow() > 1) {
    orderSheet.getRange(2, 1, orderSheet.getLastRow(), orderSheet.getLastColumn()).clearContent();
  }

  let totalOrders = 0;
  values.forEach((row, index) => {
    const ts = row[0];
    const orders = buildOrdersFromFormRow_(formHeaders, row, {
      idPrefix: 'ord_row' + String(index + 2),
      createdAt: ts instanceof Date ? ts : new Date()
    });
    totalOrders += appendOrderRows_(orderSheet, headers, orders);
  });

  return '完了: ' + (lastRow - 1) + ' 件の回答から ' + totalOrders + ' 行を ORDERS に取り込みました';
}

/**
 * フォームの列名を確認（列マッピング調整用）
 */
function inspectFormColumns() {
  const ss = getFormSpreadsheet_();
  const sheet = getFormResponseSheet_(ss);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(h => String(h).trim());
  Logger.log(headers.join('\n'));
  return headers;
}

function doGet(e) {
  const ss = getFormSpreadsheet_();
  const type = (e && e.parameter && e.parameter.type) || 'orders';
  const callback = e && e.parameter && e.parameter.callback;

  if (type === 'version') {
    return jsonResponse_({ api_version: '2026-06-21-orders-v1' }, callback);
  }

  if (type === 'orders') {
    return jsonResponse_(getPublicOrders_(ss), callback);
  }

  return jsonResponse_({ error: 'unknown type', type: type }, callback);
}

function getPublicOrders_(ss) {
  const sheet = ss.getSheetByName('ORDERS');
  if (!sheet || sheet.getLastRow() <= 1) return [];

  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(h => String(h).trim());
  const adminKeys = new Set(['edit_url', 'form_response_id', 'created_at', 'updated_at']);

  return values.slice(1)
    .filter(row => row[0])
    .map(row => {
      const record = {};
      headers.forEach((header, index) => {
        if (header) record[header] = row[index];
      });
      adminKeys.forEach(key => delete record[key]);
      if (record.menu_date instanceof Date) {
        record.menu_date = formatMenuDate_(record.menu_date);
      }
      record.quantity = parseQuantity_(record.quantity) || 0;
      return record;
    })
    .filter(order => order.title && order.quantity > 0);
}

function jsonResponse_(data, callback) {
  const json = JSON.stringify(data);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
