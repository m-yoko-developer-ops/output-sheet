# 本番セットアップ（出数表入力）

## 全体像

```
Googleフォーム → gas-form-submit.gs → メニュー表（DB）
メニュー表 → gas-order-form.gs（API）→ GitHub Pages
フォームの回答 1 … Google標準の回答ログ（参照用）
```

**GAS は2つ（別プロジェクト）:**

| ファイル | 貼り付け先 | 役割 |
|----------|------------|------|
| `docs/gas-form-submit.gs` | **Google フォーム** のスクリプト | 送信 → メニュー表へ **追記** |
| `docs/gas-order-form.gs` | **スプレッドシート** のスクリプト | 一括取込・サイト公開 API |

フォーム（入力）: https://forms.gle/EFGetgC9g185UaYN7
公開サイト:       https://m-yoko-developer-ops.github.io/output-sheet/

**1行 = 1日分。** 日付がキーで、各列にカテゴリ別メニュー名が入ります。

---

## スプレッドシート列（想定）

| 列 | 内容 |
|----|------|
| 日付 | 2026/06/12 など |
| 日替わり　メニュー名 | 例: 豚のバーベキューソース |
| 健康ランチ　メニュー名 | 例: タラの唐揚げ梅ソース |
| おすすめ　メニュー名 | 例: 鶏肉チリ玉あんかけ |
| 麵ランチ  メニュー名 | 例: 濃厚味噌ラーメン |
| お手頃350麵（補食）  メニュー名 | 例: 鶏天うどん |
| 備考 | 調理メモ |
| ＃１ ＃２ ＃３ | Google Drive 画像リンク |
| edit_url | フォーム回答の編集URL（送信時に自動保存） |

---

## 1. Apps Script（スプレッドシート用・API）

1. **メニュー表のスプレッドシート** → 拡張機能 → Apps Script
2. `docs/gas-order-form.gs` を `Code.gs` に貼り付け → 保存
3. **`setupSpreadsheetId`** を1回実行（権限許可）
4. **`importFormResponsesToMenuSheet`** で既存回答を一括取込（初回のみ）
5. **デプロイ → ウェブアプリ** → アクセス: **全員** → 新バージョン
6. URL を `js/config.js` の `api.baseUrl` に設定

### 動作確認（API）

| URL | 期待結果 |
|-----|----------|
| `.../exec?type=version` | `{ "api_version": "..." }` |
| `.../exec?type=menus` | 日付ごとの JSON 配列 |

---

## 2. Apps Script（フォーム用・送信転記）

1. [出数表入力フォーム](https://forms.gle/EFGetgC9g185UaYN7) を開く
2. ⋮ → **スクリプトエディタ**（フォームに紐づく Apps Script）
3. `docs/gas-form-submit.gs` を `Code.gs` に貼り付け → 保存
4. フォーム設定 → **回答** → **回答を編集** をオン（編集URLが空になるのを防ぐ）
5. **`installFormSubmitTrigger`** を1回実行
6. 任意: **`testAppendLastResponse`** で最新回答1件の追記テスト

### フォーム送信時の動き

- メニュー表の **末尾に1行追加**（既存行は上書きしない）
- 同日付を再送信した場合も **新しい行が増える**
- サイト表示は API 側で **同日付の最終行** を採用

| 関数 | 用途 |
|------|------|
| `installFormSubmitTrigger` | トリガー登録（1回） |
| `onFormSubmit` | 送信時に自動実行 |
| `testAppendLastResponse` | 最新回答1件を追記テスト |

---

## 3. GitHub Pages

`js/config.js` 設定後、GitHub Desktop で push。

---

## 4. 確認チェックリスト

- [ ] TOP で日付を変えるとメニュー名が切り替わる
- [ ] デフォルトは **日替わり**
- [ ] **メニュー ▼** で健康 / おすすめ / 麵ランチ / お手頃350
- [ ] **入力** で Google フォームが開く
- [ ] 閲覧 PIN 入力後に一覧が表示される（PIN は `js/links.js` の `accessPin`）
- [ ] スマホ幅で1カラム表示
- [ ] API 未設定時は `data/menus.json` のサンプル表示

---

## 5. 列名が合わないとき

1. `inspectMenuColumns` を実行
2. `docs/gas-order-form.gs` の `MENU_FIELD_RULES_` を調整
3. GAS を **新バージョン** で再デプロイ
