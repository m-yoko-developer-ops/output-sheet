# 本番セットアップ（出数表入力）

## 全体像

```
フォーム回答 → GAS → ORDERS シート → API → GitHub Pages
フォーム URL: https://forms.gle/EFGetgC9g185UaYN7
公開サイト:   https://m-yoko-developer-ops.github.io/output-sheet/
```

---

## 1. Apps Script を設置

1. [出数表入力フォーム](https://forms.gle/EFGetgC9g185UaYN7) を開く
2. **回答** タブ → スプレッドシートアイコン → 回答先スプレッドシートを開く
3. **拡張機能 → Apps Script**
4. `docs/gas-order-form.gs` の内容を `Code.gs` に貼り付け → **保存**

### 初回：スプレッドシート ID の保存

1. 回答先スプレッドシート → **拡張機能 → Apps Script**（フォームではなくスプレッドシートから開く）
2. 関数 **`setupSpreadsheetId`** を1回実行

### 初回：既存回答の取り込み（840件など）

1. 関数プルダウンで **`rebuildOrdersFromFormResponses`** を選択
2. **実行** → 権限を許可
3. ログに「○ 件の回答から ○ 行を ORDERS に取り込みました」と出れば OK
4. スプレッドシートに **`ORDERS`** シートができ、メニュー行が並ぶ

列名が想定と違う場合は **`inspectFormColumns`** を実行し、ログの列名を確認してください。

### トリガー（新規送信）

| 項目 | 内容 |
|------|------|
| 関数 | `onFormSubmit` |
| イベント | フォームから → 送信時 |

### ウェブアプリ公開

| 項目 | 内容 |
|------|------|
| 種類 | ウェブアプリ |
| 実行ユーザー | 自分 |
| アクセス | **全員** |
| 重要 | コード変更のたび **新バージョン** で再デプロイ |

発行 URL を `js/config.js` の `api.baseUrl` に貼る。

### 動作確認

| URL | 期待結果 |
|-----|----------|
| `.../exec?type=version` | `{ "api_version": "..." }` |
| `.../exec?type=orders` | メニュー行の JSON 配列 |

---

## 2. ORDERS シート列

```
id, menu_date, assignee, category, title, quantity, unit,
edit_url, form_response_id, created_at, updated_at
```

| 列 | サイト表示 |
|----|-----------|
| `menu_date` | TOP の日付 |
| `category` | daily / health / recommend / noodle / budget |
| `title` | メニュー名 |
| `quantity` | 出数 |
| `assignee` | 入力者 |
| `unit` | 単位（食） |

### カテゴリの自動判定（フォーム列名から）

| 列名に含まれる語 | category |
|-----------------|----------|
| 日替わり 等 | `daily` |
| 健康 | `health` |
| おすすめ | `recommend` |
| 麺 / ラーメン / ランチ | `noodle` |
| おてごろ | `budget` |
| 上記以外（数値のみ） | `daily`（列名＝メニュー名） |

---

## 3. GitHub Pages

`js/config.js` に GAS URL を設定後、GitHub Desktop で push。

---

## 4. 確認チェックリスト

- [ ] `?type=orders` で JSON が返る
- [ ] TOP で今日の日付・日替わりメニューが表示される
- [ ] メニュー ▼ で健康 / おすすめ / 麺ランチ / おてごろに切り替わる
- [ ] **入力** ボタンでフォームが開く
- [ ] フォーム送信 → ORDERS に行が増える
- [ ] API 障害時は `data/orders.json` にフォールバック（警告バナー表示）

---

## 5. 列名が合わないとき

1. `inspectFormColumns` で実際の列名を確認
2. `docs/gas-order-form.gs` の `CATEGORY_RULES_` / `SKIP_HEADERS_` を調整
3. `rebuildOrdersFromFormResponses` を再実行
4. GAS を **新バージョン** で再デプロイ
