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
 *
 * ※フォーム送信時のメニュー表転記は docs/gas-form-submit.gs（フォーム側 GAS）を使う
 */

var MENU_FIELD_RULES_ = [
  { field: 'menu_date', patterns: [/^日付$/] },
  { field: 'assignee', patterns: [/^入力者$/] },
  { field: 'daily', patterns: [/日替わり.*メニュー/i] },
  { field: 'health', patterns: [/健康.*メニュー/i] },
  { field: 'recommend', patterns: [/おすすめ.*メニュー/i] },
  { field: 'noodle', patterns: [/麺?ランチ.*メニュー/i, /麵ランチ/i] },
  { field: 'budget', patterns: [/お手頃.*メニュー/i, /500.*メニュー/i, /350.*メニュー/i, /軽食.*メニュー/i, /補食.*メニュー/i] },
  { field: 'notes', patterns: [/^備考$/] },
  { field: 'image1', patterns: [/^[＃#]\s*1$/, /^[＃#]１$/] },
  { field: 'image2', patterns: [/^[＃#]\s*2$/, /^[＃#]２$/] },
  { field: 'image3', patterns: [/^[＃#]\s*3$/, /^[＃#]３$/] },
  { field: 'edit_url', patterns: [/^edit[_\s-]?url$/i, /^編集\s*url$/i] }
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
  var props = PropertiesService.getScriptProperties();
  props.setProperty('MENU_SHEET_NAME', 'メニュー表');
  return 'SPREADSHEET_ID を保存しました: ' + getSpreadsheetId_() + ' / MENU_SHEET_NAME=メニュー表';
}

function getFormResponseSheet_(ss) {
  var sheets = ss.getSheets();
  var best = null;
  var bestRows = 0;
  for (var i = 0; i < sheets.length; i++) {
    if (!isFormResponseSheet_(sheets[i].getName())) continue;
    var rows = sheets[i].getLastRow();
    if (rows > bestRows) {
      best = sheets[i];
      bestRows = rows;
    }
  }
  return best;
}

function readSheetData_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    return { headers: values.length ? values[0].map(normalizeHeader_) : [], rows: [] };
  }
  return {
    headers: values[0].map(normalizeHeader_),
    rows: values.slice(1)
  };
}

function findTimestampColumn_(headers) {
  for (var i = 0; i < headers.length; i++) {
    if (/^タイムスタンプ$/i.test(headers[i])) return i;
  }
  return -1;
}

function writeDataRows_(sheet, startRow, values) {
  if (!values.length) return;
  var numRows = values.length;
  var numCols = values[0].length;
  sheet.getRange(startRow, 1, numRows, numCols).setValues(values);
}

function clearDataRowsFrom_(sheet, startRow, lastRow, numCols) {
  if (lastRow < startRow) return;
  var numRows = lastRow - startRow + 1;
  sheet.getRange(startRow, 1, numRows, numCols).clearContent();
}

function recordToTargetRow_(record, targetHeaders) {
  var fieldToValue = {
    menu_date: record.menu_date,
    assignee: record.assignee,
    daily: record.daily,
    health: record.health,
    recommend: record.recommend,
    noodle: record.noodle,
    budget: record.budget,
    notes: record.notes,
    image1: record.images[0] || '',
    image2: record.images[1] || '',
    image3: record.images[2] || '',
    edit_url: record.edit_url || ''
  };

  return targetHeaders.map(function (header) {
    var normalized = normalizeHeader_(header);
    if (!normalized) return '';

    for (var i = 0; i < MENU_FIELD_RULES_.length; i++) {
      var rule = MENU_FIELD_RULES_[i];
      var matched = rule.patterns.some(function (pattern) {
        return pattern.test(normalized);
      });
      if (matched) {
        return fieldToValue[rule.field] != null ? fieldToValue[rule.field] : '';
      }
    }
    return '';
  });
}

/**
 * フォームの回答 → メニュー表 へ一括取り込み（初回1回）
 * 同じ日付が複数ある場合はタイムスタンプが新しい行を採用
 */
function importFormResponsesToMenuSheet() {
  var ss = getSpreadsheet_();
  var props = PropertiesService.getScriptProperties();
  props.setProperty('MENU_SHEET_NAME', 'メニュー表');

  var source = getFormResponseSheet_(ss);
  if (!source) {
    throw new Error('「フォームの回答」シートが見つかりません');
  }

  var target = ss.getSheetByName('メニュー表');
  if (!target) {
    throw new Error('「メニュー表」シートがありません');
  }

  var srcLastRow = source.getLastRow();
  if (srcLastRow <= 1) {
    return 'フォームの回答にデータがありません';
  }

  var srcData = readSheetData_(source);
  var srcHeaders = srcData.headers;
  var srcValues = srcData.rows;
  var srcHeaderMap = buildHeaderMap_(srcHeaders);
  var tsCol = findTimestampColumn_(srcHeaders);

  var stats = {
    sourceRows: srcValues.length,
    skippedNoDate: 0,
    usedDateColumn: 0,
    usedTimestampFallback: 0
  };

  var byDate = {};
  srcValues.forEach(function (row) {
    var resolved = resolveMenuDateFromRow_(row, srcHeaderMap, tsCol);
    if (!resolved.menu_date) {
      stats.skippedNoDate++;
      return;
    }
    if (resolved.source === 'date') stats.usedDateColumn++;
    if (resolved.source === 'timestamp') stats.usedTimestampFallback++;

    var record = rowToMenuRecord_(row, srcHeaderMap, resolved.menu_date);
    if (!record) {
      stats.skippedNoDate++;
      return;
    }

    var tsTime = 0;
    if (tsCol >= 0 && row[tsCol] instanceof Date) {
      tsTime = row[tsCol].getTime();
    }

    var existing = byDate[record.menu_date];
    if (!existing || tsTime >= existing.tsTime) {
      byDate[record.menu_date] = { record: record, tsTime: tsTime };
    }
  });

  var dates = Object.keys(byDate).sort();
  var tgtWidth = Math.max(target.getLastColumn(), 1);
  var targetHeaders = target.getRange(1, 1, 1, tgtWidth).getValues()[0];
  var outRows = dates.map(function (date) {
    return recordToTargetRow_(byDate[date].record, targetHeaders);
  });

  var targetLastRow = target.getLastRow();
  if (targetLastRow > 1) {
    clearDataRowsFrom_(target, 2, targetLastRow, tgtWidth);
  }
  if (outRows.length) {
    writeDataRows_(target, 2, outRows);
  }

  Logger.log(
    '取込完了: フォーム回答 ' + stats.sourceRows + ' 行 → ' + outRows.length + ' 日分' +
    '（日付列=' + stats.usedDateColumn + ', タイムスタンプ代替=' + stats.usedTimestampFallback +
    ', 日付なしスキップ=' + stats.skippedNoDate + '）'
  );

  return '完了: フォーム回答 ' + stats.sourceRows + ' 行から ' + outRows.length +
    ' 日分をメニュー表に取り込みました（同日は最新の回答）';
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

function isTimestampHeader_(header) {
  return /^タイムスタンプ$/i.test(normalizeHeader_(header));
}

function buildHeaderMap_(headers) {
  var map = {};

  // 1) 日付は「日付」列のみ（タイムスタンプ列は使わない）
  headers.forEach(function (header, index) {
    if (isTimestampHeader_(header)) return;
    if (normalizeHeader_(header) === '日付' && map.menu_date == null) {
      map.menu_date = index;
    }
  });

  // 2) その他の列（タイムスタンプは除外）
  headers.forEach(function (header, index) {
    var normalized = normalizeHeader_(header);
    if (!normalized || isTimestampHeader_(header)) return;

    for (var i = 0; i < MENU_FIELD_RULES_.length; i++) {
      var rule = MENU_FIELD_RULES_[i];
      if (rule.field === 'menu_date') continue;
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
    var hasTimestamp = headers.some(function (header) {
      return isTimestampHeader_(header);
    });
    if (!hasTimestamp) {
      throw new Error('「日付」列が見つかりません（タイムスタンプ列もありません）。');
    }
  }

  return map;
}

/** 日付列を優先。空ならタイムスタンプ列を使う */
function resolveMenuDateFromRow_(row, headerMap, tsCol) {
  var menuDate = '';
  var source = '';

  if (headerMap.menu_date != null) {
    menuDate = formatMenuDate_(cellText_(row, headerMap.menu_date));
    if (menuDate) source = 'date';
  }

  if (!menuDate && tsCol >= 0) {
    menuDate = formatMenuDate_(cellText_(row, tsCol));
    if (menuDate) source = 'timestamp';
  }

  return { menu_date: menuDate, source: source };
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

function rowToMenuRecord_(row, headerMap, menuDateOverride) {
  var menuDate = menuDateOverride || formatMenuDate_(cellText_(row, headerMap.menu_date));
  if (!menuDate) return null;

  var images = [];
  ['image1', 'image2', 'image3'].forEach(function (key) {
    var text = cellText_(row, headerMap[key]);
    if (text) images.push(String(text));
  });

  return {
    id: 'menu-' + menuDate,
    menu_date: menuDate,
    assignee: cellText_(row, headerMap.assignee),
    daily: cellText_(row, headerMap.daily),
    health: cellText_(row, headerMap.health),
    recommend: cellText_(row, headerMap.recommend),
    noodle: cellText_(row, headerMap.noodle),
    budget: cellText_(row, headerMap.budget),
    notes: cellText_(row, headerMap.notes),
    images: images,
    edit_url: cellText_(row, headerMap.edit_url)
  };
}

function getPublicMenus_(ss) {
  var sheet = getMenuSheet_(ss);
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  var width = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, width).getValues()[0].map(normalizeHeader_);
  var headerMap = buildHeaderMap_(headers);
  var tsCol = findTimestampColumn_(headers);
  var values = readSheetData_(sheet).rows;
  var byDate = {};

  values.forEach(function (row) {
    var resolved = resolveMenuDateFromRow_(row, headerMap, tsCol);
    if (!resolved.menu_date) return;
    var record = rowToMenuRecord_(row, headerMap, resolved.menu_date);
    if (record) byDate[record.menu_date] = record;
  });

  return Object.keys(byDate)
    .map(function (date) { return byDate[date]; })
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

/** フォーム回答シートの列マッピング確認（取り込み前に実行） */
function inspectFormResponseColumns() {
  var ss = getSpreadsheet_();
  var sheet = getFormResponseSheet_(ss);
  if (!sheet) {
    throw new Error('「フォームの回答」シートが見つかりません');
  }
  var data = readSheetData_(sheet);
  var map = buildHeaderMap_(data.headers);
  var tsCol = findTimestampColumn_(data.headers);
  Logger.log('Sheet: ' + sheet.getName() + ' / rows=' + data.rows.length);
  Logger.log(data.headers.join(' | '));
  Logger.log(JSON.stringify(map, null, 2));
  Logger.log('timestamp column index: ' + tsCol);
  return { headers: data.headers, map: map, rows: data.rows.length };
}

/** 取り込み前の診断（日付列の空欄数など） */
function diagnoseFormImport() {
  var ss = getSpreadsheet_();
  var sheet = getFormResponseSheet_(ss);
  if (!sheet) throw new Error('「フォームの回答」シートが見つかりません');

  var data = readSheetData_(sheet);
  var map = buildHeaderMap_(data.headers);
  var tsCol = findTimestampColumn_(data.headers);
  var stats = {
    sheetName: sheet.getName(),
    totalRows: data.rows.length,
    dateColumnFilled: 0,
    timestampOnly: 0,
    noDateAtAll: 0,
    uniqueDates: {}
  };

  data.rows.forEach(function (row) {
    var resolved = resolveMenuDateFromRow_(row, map, tsCol);
    if (!resolved.menu_date) {
      stats.noDateAtAll++;
      return;
    }
    stats.uniqueDates[resolved.menu_date] = true;
    if (resolved.source === 'date') stats.dateColumnFilled++;
    if (resolved.source === 'timestamp') stats.timestampOnly++;
  });

  stats.uniqueDateCount = Object.keys(stats.uniqueDates).length;
  delete stats.uniqueDates;

  Logger.log(JSON.stringify(stats, null, 2));
  return stats;
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
