# 本番セットアップ（出数表入力）

## 全体像

```
スプレッドシート（日付1行）→ GAS API → GitHub Pages
フォーム（入力）: https://forms.gle/EFGetgC9g185UaYN7
公開サイト:       https://m-yoko-developer-ops.github.io/output-sheet/
```

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

---

## 1. Apps Script

1. **メニュー表のスプレッドシート** → 拡張機能 → Apps Script  
   （フォーム回答シートではなく、日付×メニュー名のマスター表）
2. `docs/gas-order-form.gs` を `Code.gs` に貼り付け → 保存
3. **`setupSpreadsheetId`** を1回実行（権限許可）
4. 必要なら **`inspectMenuColumns`** で列マッピングを確認
5. **デプロイ → ウェブアプリ** → アクセス: **全員** → 新バージョン
6. URL を `js/config.js` の `api.baseUrl` に設定

### 動作確認

| URL | 期待結果 |
|-----|----------|
| `.../exec?type=version` | `{ "api_version": "..." }` |
| `.../exec?type=menus` | 日付ごとの JSON 配列 |

### 別シート名を使う場合

Apps Script → プロジェクトの設定 → スクリプト プロパティ:

- `MENU_SHEET_NAME` = シート名（例: `出数表`）

---

## 2. GitHub Pages

`js/config.js` 設定後、GitHub Desktop で push。

---

## 3. 確認チェックリスト

- [ ] TOP で日付を変えるとメニュー名が切り替わる
- [ ] デフォルトは **日替わり**
- [ ] **メニュー ▼** で健康 / おすすめ / 麵ランチ / お手頃350
- [ ] **入力** で Google フォームが開く
- [ ] スマホ幅で1カラム表示
- [ ] API 未設定時は `data/menus.json` のサンプル表示

---

## 4. 列名が合わないとき

1. `inspectMenuColumns` を実行
2. `docs/gas-order-form.gs` の `MENU_FIELD_RULES_` を調整
3. GAS を **新バージョン** で再デプロイ
