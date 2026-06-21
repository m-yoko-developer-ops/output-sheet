/**
 * 出数表入力 — フォーム送信 → メニュー表 転記
 *
 * 【こちらは Google フォーム側の Apps Script】
 * スプレッドシート用 API（gas-order-form.gs）とは別プロジェクトです。
 *
 * セットアップ:
 * 1. Google フォームを開く → ⋮ → スクリプトエディタ
 * 2. このコードを Code.gs に貼り付け → 保存
 * 3. installFormSubmitTrigger を1回実行（権限許可）
 * 4. testAppendLastResponse で転記テスト（任意）
 *
 * 動作:
 * - フォーム送信のたびにメニュー表へ **1行追加**（既存行は上書きしない）
 * - フォームの回答シートにも Google 標準で行が追加される
 * - サイト API は同日付のうち **最後に追加された行** を表示
 */

var MENU_SHEET_NAME = 'メニュー表';

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
  { field: 'image3', patterns: [/^[＃#]\s*3$/, /^[＃#]３$/] }
];

function normalizeHeader_(header) {
  return String(header || '')
    .replace(/\s+/g, ' ')
    .replace(/[　]+/g, ' ')
    .trim();
}

function normalizeTitle_(title) {
  return normalizeHeader_(
    String(title || '').replace(/^[0-9０-９]+[.．、\s]*/, '')
  );
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

function fileResponseToUrl_(response) {
  if (response == null || response === '') return '';

  if (Array.isArray(response)) {
    if (!response.length) return '';
    return fileResponseToUrl_(response[0]);
  }

  var text = String(response).trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  return 'https://drive.google.com/open?id=' + text;
}

function responseText_(response) {
  if (response == null) return '';
  if (Array.isArray(response)) return response.map(String).join(', ');
  return String(response).trim();
}

function getDestinationSpreadsheet_() {
  var form = FormApp.getActiveForm();
  if (!form) {
    throw new Error('Google フォームから Apps Script を開いてください');
  }

  var id = form.getDestinationId();
  if (!id) {
    throw new Error('フォームの回答先スプレッドシートが未設定です');
  }

  return SpreadsheetApp.openById(id);
}

function getMenuSheet_(ss) {
  var sheet = ss.getSheetByName(MENU_SHEET_NAME);
  if (!sheet) {
    throw new Error('シート「' + MENU_SHEET_NAME + '」が見つかりません');
  }
  return sheet;
}

function isEditUrlHeader_(header) {
  var normalized = normalizeHeader_(header);
  return /^edit[_\s-]?url$/i.test(normalized) || normalized === '編集URL';
}

function ensureEditUrlHeader_(sheet) {
  var width = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, width).getValues()[0];

  for (var i = 0; i < headers.length; i++) {
    if (isEditUrlHeader_(headers[i])) {
      return headers;
    }
  }

  var col = width + 1;
  sheet.getRange(1, col).setValue('edit_url');
  headers.push('edit_url');
  return headers;
}

function readMenuHeaders_(sheet) {
  var width = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(1, 1, 1, width).getValues()[0];
}

function safeEditResponseUrl_(response) {
  try {
    return response.getEditResponseUrl() || '';
  } catch (err) {
    Logger.log('edit_url skipped: ' + (err.message || err));
    return '';
  }
}

function formResponseToMenuRecord_(response) {
  var record = {
    menu_date: '',
    assignee: '',
    daily: '',
    health: '',
    recommend: '',
    noodle: '',
    budget: '',
    notes: '',
    images: [],
    edit_url: safeEditResponseUrl_(response)
  };

  response.getItemResponses().forEach(function (itemResponse) {
    try {
      var item = itemResponse.getItem();
      if (!item) return;

      var title = normalizeTitle_(item.getTitle());
      var value = itemResponse.getResponse();

      for (var i = 0; i < MENU_FIELD_RULES_.length; i++) {
        var rule = MENU_FIELD_RULES_[i];
        var matched = rule.patterns.some(function (pattern) {
          return pattern.test(title);
        });
        if (!matched) continue;

        if (rule.field === 'menu_date') {
          record.menu_date = formatMenuDate_(value);
        } else if (rule.field === 'image1' || rule.field === 'image2' || rule.field === 'image3') {
          var url = fileResponseToUrl_(value);
          if (url) record.images.push(url);
        } else {
          record[rule.field] = responseText_(value);
        }
        break;
      }
    } catch (err) {
      Logger.log('skip item response: ' + (err.message || err));
    }
  });

  if (!record.menu_date) {
    record.menu_date = formatMenuDate_(response.getTimestamp());
  }

  if (!record.menu_date) {
    throw new Error('日付が取得できません');
  }

  return record;
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

    if (isEditUrlHeader_(normalized)) {
      return fieldToValue.edit_url;
    }

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

/** メニュー表の末尾に1行追加（上書きしない） */
function appendMenuRecord_(record) {
  var ss = getDestinationSpreadsheet_();
  var target = getMenuSheet_(ss);
  ensureEditUrlHeader_(target);

  var targetHeaders = readMenuHeaders_(target);
  var outRow = recordToTargetRow_(record, targetHeaders);

  if (!outRow.length) {
    throw new Error('メニュー表の列が取得できません（1行目のヘッダーを確認してください）');
  }

  target.appendRow(outRow);
  var newRow = target.getLastRow();

  return {
    action: 'appended',
    row: newRow,
    menu_date: record.menu_date,
    spreadsheet_id: ss.getId(),
    sheet_name: target.getName()
  };
}

function appendMenuRecordFromResponse_(response) {
  var record = formResponseToMenuRecord_(response);
  return appendMenuRecord_(record);
}

/** フォーム送信時に自動実行 */
function onFormSubmit(e) {
  try {
    if (!e || !e.response) {
      throw new Error('onFormSubmit: 回答データがありません');
    }

    var result = appendMenuRecordFromResponse_(e.response);
    Logger.log('onFormSubmit OK: ' + JSON.stringify(result));
  } catch (err) {
    Logger.log('onFormSubmit ERROR: ' + (err.message || err));
    throw err;
  }
}

/** セットアップ診断（失敗時に1回実行） */
function diagnoseFormSubmitSetup() {
  var report = {
    ok: true,
    checks: []
  };

  function addCheck(name, passed, detail) {
    report.checks.push({ name: name, passed: passed, detail: detail || '' });
    if (!passed) report.ok = false;
  }

  try {
    var form = FormApp.getActiveForm();
    addCheck('active_form', !!form, form ? form.getTitle() : 'フォームから Apps Script を開いてください');
    if (!form) {
      Logger.log(JSON.stringify(report, null, 2));
      return report;
    }

    var destId = form.getDestinationId();
    addCheck('form_destination', !!destId, destId || 'フォームの回答先スプレッドシートが未設定です');

    if (destId) {
      var ss = SpreadsheetApp.openById(destId);
      addCheck('open_spreadsheet', !!ss, ss ? ss.getName() : 'スプレッドシートを開けません');

      if (ss) {
        var menuSheet = ss.getSheetByName(MENU_SHEET_NAME);
        addCheck('menu_sheet', !!menuSheet, menuSheet ? '見つかりました' : 'シート「' + MENU_SHEET_NAME + '」がありません');

        if (menuSheet) {
          var headers = menuSheet.getRange(1, 1, 1, Math.max(menuSheet.getLastColumn(), 1))
            .getValues()[0]
            .map(normalizeHeader_)
            .filter(Boolean);
          addCheck('menu_headers', headers.length > 0, headers.join(' | ') || '1行目が空です');
        }

        var sheetNames = ss.getSheets().map(function (s) { return s.getName(); });
        addCheck('sheet_list', true, sheetNames.join(', '));
      }
    }

    var triggers = ScriptApp.getProjectTriggers().filter(function (t) {
      return t.getHandlerFunction() === 'onFormSubmit';
    });
    addCheck('onFormSubmit_trigger', triggers.length > 0, triggers.length ? '登録済み' : 'installFormSubmitTrigger を実行してください');
  } catch (err) {
    addCheck('unexpected_error', false, err.message || String(err));
  }

  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

/** フォーム送信トリガーを登録（1回だけ） */
function installFormSubmitTrigger() {
  var form = FormApp.getActiveForm();
  if (!form) {
    throw new Error('Google フォームから Apps Script を開いてください');
  }

  var handler = 'onFormSubmit';
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger(handler)
    .forForm(form)
    .onFormSubmit()
    .create();

  return 'フォーム送信トリガーを設定しました（メニュー表へ追記）';
}

/** テスト: 最新の回答1件をメニュー表へ追記 */
function testAppendLastResponse() {
  var form = FormApp.getActiveForm();
  if (!form) throw new Error('Google フォームから Apps Script を開いてください');

  Logger.log('step1: getResponses start');
  var responses = form.getResponses();
  if (!responses.length) return 'フォーム回答がありません';
  Logger.log('step1: responses=' + responses.length);

  var response = responses[responses.length - 1];
  Logger.log('step2: latest timestamp=' + response.getTimestamp());

  var record = formResponseToMenuRecord_(response);
  Logger.log('step3: menu_date=' + record.menu_date);

  var result = appendMenuRecord_(record);
  Logger.log('step4 OK: ' + JSON.stringify(result, null, 2));
  return result;
}
