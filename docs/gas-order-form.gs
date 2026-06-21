/**
 * 出数表入力 — スプレッドシート（日付×メニュー名）→ 公開 API
 *
 * 想定シート列:
 * 日付 | 日替わり メニュー名 | 健康ランチ メニュー名 | おすすめ メニュー名 |
 * 麵ランチ メニュー名 | お手頃350… メニュー名 | 備考 | ＃１ | ＃２ | ＃３
 *
 * セットアップ:
 * 1. メニュー表のスプレッドシート → 拡張機能 → Apps Script
 * 2. このコードを Code.gs に貼り付け
 * 3. setupSpreadsheetId を1回実行
 * 4. デプロイ → ウェブアプリ → アクセス: 全員
 * 5. URL を js/config.js の api.baseUrl に設定
 */

var MENU_FIELD_RULES_ = [
  { field: 'menu_date', patterns: [/^日付$/] },
  { field: 'daily', patterns: [/日替わり.*メニュー/i] },
  { field: 'health', patterns: [/健康.*メニュー/i] },
  { field: 'recommend', patterns: [/おすすめ.*メニュー/i] },
  { field: 'noodle', patterns: [/麺?ランチ.*メニュー/i, /麵ランチ/i] },
  { field: 'budget', patterns: [/お手頃.*メニュー/i, /350.*メニュー/i, /補食.*メニュー/i] },
  { field: 'notes', patterns: [/^備考$/] },
  { field: 'image1', patterns: [/^[＃#]１$/, /^[＃#]1$/] },
  { field: 'image2', patterns: [/^[＃#]２$/, /^[＃#]2$/] },
  { field: 'image3', patterns: [/^[＃#]３$/, /^[＃#]3$/] }
];

function normalizeHeader_(header) {
  return String(header || '')
    .replace(/\s+/g, ' ')
    .replace(/[　]+/g, ' ')
    .trim();
}

function getSpreadsheetId_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID');
  if (id) return id;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) id = ss.getId();

  if (!id) {
    throw new Error('スプレッドシートから Apps Script を開き、setupSpreadsheetId を1回実行してください。');
  }

  props.setProperty('SPREADSHEET_ID', id);
  return id;
}

function setupSpreadsheetId() {
  return 'SPREADSHEET_ID を保存しました: ' + getSpreadsheetId_();
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(getSpreadsheetId_());
}

function isFormResponseSheet_(name) {
  return /^フォームの回答/i.test(name) || /^Form Responses/i.test(name);
}

function getMenuSheet_(ss) {
  var configured = PropertiesService.getScriptProperties().getProperty('MENU_SHEET_NAME');
  if (configured) {
    var named = ss.getSheetByName(configured);
    if (named) return named;
  }

  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    if (isFormResponseSheet_(sheet.getName())) continue;
    var headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0]
      .map(normalizeHeader_);
    if (headers.some(function (h) { return h === '日付'; })) {
      return sheet;
    }
  }

  throw new Error('「日付」列があるシートが見つかりません。MENU_SHEET_NAME を設定するか、1行目に日付列を用意してください。');
}

function buildHeaderMap_(headers) {
  var map = {};
  headers.forEach(function (header, index) {
    var normalized = normalizeHeader_(header);
    if (!normalized) return;

    for (var i = 0; i < MENU_FIELD_RULES_.length; i++) {
      var rule = MENU_FIELD_RULES_[i];
      var matched = rule.patterns.some(function (pattern) {
        return pattern.test(normalized);
      });
      if (matched && map[rule.field] == null) {
        map[rule.field] = index;
        break;
      }
    }
  });

  if (map.menu_date == null) {
    throw new Error('「日付」列が見つかりません。');
  }

  return map;
}

function formatMenuDate_(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy-MM-dd');
  }
  var text = String(value).trim();
  var parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, 'Asia/Tokyo', 'yyyy-MM-dd');
  }
  var m = text.match(/(\d{4})[\/\-年.](\d{1,2})[\/\-月.](\d{1,2})/);
  if (m) {
    return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  }
  return text;
}

function cellText_(row, index) {
  if (index == null || index < 0) return '';
  var value = row[index];
  if (value == null) return '';
  if (value instanceof Date) return value;
  return String(value).trim();
}

function rowToMenuRecord_(row, headerMap) {
  var menuDate = formatMenuDate_(cellText_(row, headerMap.menu_date));
  if (!menuDate) return null;

  var images = [];
  ['image1', 'image2', 'image3'].forEach(function (key) {
    var text = cellText_(row, headerMap[key]);
    if (text) images.push(String(text));
  });

  return {
    id: 'menu-' + menuDate,
    menu_date: menuDate,
    daily: cellText_(row, headerMap.daily),
    health: cellText_(row, headerMap.health),
    recommend: cellText_(row, headerMap.recommend),
    noodle: cellText_(row, headerMap.noodle),
    budget: cellText_(row, headerMap.budget),
    notes: cellText_(row, headerMap.notes),
    images: images
  };
}

function getPublicMenus_(ss) {
  var sheet = getMenuSheet_(ss);
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  var width = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, width).getValues()[0].map(normalizeHeader_);
  var headerMap = buildHeaderMap_(headers);
  var values = sheet.getRange(2, 1, lastRow - 1, width).getValues();

  return values
    .map(function (row) { return rowToMenuRecord_(row, headerMap); })
    .filter(function (record) { return record && record.menu_date; })
    .sort(function (a, b) { return b.menu_date.localeCompare(a.menu_date); });
}

function inspectMenuColumns() {
  var ss = getSpreadsheet_();
  var sheet = getMenuSheet_(ss);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(normalizeHeader_);
  Logger.log('Sheet: ' + sheet.getName());
  Logger.log(headers.join(' | '));
  Logger.log(JSON.stringify(buildHeaderMap_(headers), null, 2));
  return headers;
}

function doGet(e) {
  var ss = getSpreadsheet_();
  var type = (e && e.parameter && e.parameter.type) || 'menus';
  var callback = e && e.parameter && e.parameter.callback;

  if (type === 'version') {
    return jsonResponse_({ api_version: '2026-06-21-menus-v1' }, callback);
  }

  if (type === 'menus' || type === 'orders') {
    return jsonResponse_(getPublicMenus_(ss), callback);
  }

  return jsonResponse_({ error: 'unknown type', type: type }, callback);
}

function jsonResponse_(data, callback) {
  var json = JSON.stringify(data);
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
