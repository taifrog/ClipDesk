# ClipDesk

気になる情報や動画などをクリップして、整理もできるWebツールです。

## 技術スタック

- React 19
- TypeScript
- Vite
- Supabase（Postgres / Auth / Edge Functions）
- GitHub Pages（フロントエンドホスティング）

> **Note:** 旧 Express + better-sqlite3 バックエンドは非推奨です。新規機能は Supabase Edge Functions として実装されています。`server/` 以下はローカル開発や旧データ参照のために残されています。

## スクリプト

- `npm run dev` — フロントエンド開発サーバーを起動
- `npm run server` — 旧 Express/SQLite API サーバーを起動（非推奨）
- `npm run build` — 本番用ビルド
- `npm run preview` — ビルド結果をプレビュー
- `npm run lint` — oxlint で構文チェック

## 利用手順

ClipDesk は「Webサイト」「Supabase プロジェクト」「ブラウザ拡張機能」の3つで動作します。

### 1. 依存関係をインストールする

```bash
cd c:/data/Github/ClipDesk
npm install
```

### 2. Supabase ローカル環境を起動する（初回のみ）

[Supabase CLI](https://supabase.com/docs/guides/cli/getting-started) をインストール済みの場合、ローカルプロジェクトを起動できます。

```bash
supabase login
supabase start
```

`supabase start` の出力に表示された URL / anon key を `.env` に設定してください。

### 3. 環境変数を設定する

`.env.example` をコピーして `.env` を作成します。

```bash
cp .env.example .env
```

```env
# Supabase プロジェクト設定
# ローカル開発時は `supabase status` で表示された URL / anon key を設定する
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=your-anon-key

# Web アプリの公開 URL
# Chrome 拡張機能設定の siteUrl 既定値として使用する
VITE_SITE_URL=https://taifrog.github.io/ClipDesk/
```

本番環境では、GitHub Actions の Secrets（`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`、`VITE_SITE_URL`）から注入されます。

### 4. フロントエンド開発サーバーを起動する

```bash
npm run dev
```

`http://localhost:5173/`（ポートが使われている場合は `http://localhost:5174/` など）でサイトが開きます。

### 5. 拡張機能をビルドする

別のターミナルで実行してください。

```bash
cd c:/data/Github/ClipDesk/addon-chrome
npm install
npm run build
```

ビルド後、`addon-chrome/dist/` に読み込み可能な拡張機能が生成されます。

### 6. ブラウザに拡張機能を読み込む

1. Chrome または Comet で `chrome://extensions/` を開く
2. 「デベロッパー モード」を有効化
3. 「パッケージ化されていない拡張機能を読み込む」で `addon-chrome/dist` を選択

### 7. 拡張機能のオプションを設定する

拡張機能アイコンを右クリック →「オプション」から、以下を設定してください。

- **ClipDesk サイト URL**: `https://taifrog.github.io/ClipDesk/`（ローカル開発時は `http://localhost:5173`）
- **Supabase URL**: 使用している Supabase プロジェクトの URL（既定値が表示されていればそのままで可）
- **API キー**: ClipDesk サイトの「設定」→「拡張機能 API キー」で発行したキー

> **Note:** Web アプリから Chrome 拡張機能を経由して Obsidian に書き出すには、拡張機能の `manifest.json` に `externally_connectable` として Web アプリのオリジンが登録されている必要があります。本プロジェクトでは `https://taifrog.github.io/ClipDesk/*` と `http://localhost:5173/*` が既定で登録されています。別のオリジンでホスティングする場合は `addon-chrome/src/manifest.json` を修正し、拡張機能を再ビルドしてください。

設定は、ClipDesk サイトの「設定」で API キーを発行後に表示される「拡張機能設定をコピー」ボタンから JSON をコピーし、拡張機能のオプション画面に貼り付けることもできます。

### 8. クリップを投稿する

1. クリップしたいページを開く
2. 拡張機能アイコンをクリック
3. 「クリップを作成」ボタンを押す
4. ClipDesk サイトにページ情報が投稿され、サイト側の設定に応じて要約が行われる

### 9. サイトで整理する

- 左サイドバーからカテゴリを選択してフィルタリング
- クリップカードをドラッグ＆ドロップでサイドバーのカテゴリに分類
- 星アイコンでピン留め
- カード下部の「コメントを追加…」からメモを追加

## トラブルシューティング

### 拡張機能からクリップすると「API キーが必要です」と表示される

設定画面で API キーを発行し、拡張機能のオプションにも入力しているのに 401 エラーになる場合は、Supabase ゲートウェイ側の JWT 検証設定を確認してください。

1. Supabase ダッシュボードを開く
2. 該当プロジェクトの「Edge Functions」→「Functions」から `clip` を選択
3. 「Verify JWT with legacy secret」のトグルが **OFF** になっているか確認する
   - この設定が ON になっていると、ゲートウェイがリクエストを Edge Function に到達させる前に 401 を返します
4. OFF に変更後、ブラウザ拡張機能を更新（またはブラウザを再起動）して再度クリップを試す

`clip` Edge Function は独自の `x-api-key` ヘッダー認証を行うため、JWT 検証は無効にして問題ありません。

## Supabase プロジェクト構成

- **Database**: Postgres + Row Level Security（RLS）
- **Auth**: メール / パスワード認証（JWT）
- **Edge Functions**: `supabase/functions/` 以下に配置
  - `clip` — クリップの作成・更新・削除
  - `clips` — クリップ一覧・ゴミ箱
  - `categories` — カテゴリ管理
  - `source-sites` — 収集元サイト管理
  - `settings` — AI 要約設定
  - `collect` — RSS/スクレイピングによる記事収集
  - `user-api-keys` — Chrome 拡張機能用 API キー管理
- **Hosting（フロントエンド）**: GitHub Pages で `docs/` フォルダを公開

## ブラウザ拡張機能（addon-chrome）

`addon-chrome/` には、Chromium ベースのブラウザ向け拡張機能があります。

### 機能

- アクティブなタブの URL・タイトル・本文を取得
- ClipDesk Supabase Edge Function（`clip`）へページ情報を投稿
- API キー認証（`x-api-key` ヘッダー）に対応

### 開発手順

```bash
cd addon-chrome
npm install
npm run build
```

### ブラウザへの読み込み

1. ビルド後、`addon-chrome/dist/` ディレクトリを確認
2. ブラウザの拡張機能管理画面を開く（chrome://extensions/）
3. 「デベロッパー モード」を有効化
4. 「パッケージ化されていない拡張機能を読み込む」で `addon-chrome/dist` を選択

### 設定

拡張機能アイコンを右クリック →「オプション」から、以下を設定してください。

- **ClipDesk サイト URL**: `https://taifrog.github.io/ClipDesk/` またはローカル開発サーバーの URL
- **Supabase URL**: 使用している Supabase プロジェクトの URL
- **API キー**: ClipDesk サイトの「設定」→「拡張機能 API キー」で発行したキー

「拡張機能設定をコピー」ボタンでコピーした JSON をオプション画面の入力欄に貼り付けると、3項目をまとめて設定できます。

### 配布用 zip の入手

main ブランチへの push 時に、GitHub Actions でビルドされた拡張機能が GitHub Releases の `addon-vX.Y.Z` タグにアップロードされます。

1. リポジトリの「Releases」を開く
2. `ClipDesk Chrome Addon vX.Y.Z` を選択
3. `clipdesk-addon-chrome.zip` をダウンロード
4. zip を展開し、`dist` フォルダを「パッケージ化されていない拡張機能を読み込む」で読み込む

## CI / CD（GitHub Actions）

`.github/workflows/deploy.yml` で、main ブランチへの push 時に以下を自動実行します。

1. フロントエンドをビルド（`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_SITE_URL` を Secrets から注入）
2. ビルド成果物を `docs/` に出力（GitHub Pages 公開用）
3. SPA フォールバック用の `404.html` を作成
4. データベースマイグレーションを適用（`supabase db push`）
5. Edge Functions をデプロイ（`supabase functions deploy`）
6. Chrome 拡張機能をビルドし、GitHub Releases に zip を公開

### 必要な GitHub Secrets

| Secret | 説明 |
| --- | --- |
| `VITE_SUPABASE_URL` | フロントエンド・拡張機能用 Supabase プロジェクト URL |
| `VITE_SUPABASE_ANON_KEY` | フロントエンド用 Supabase anon key |
| `VITE_SITE_URL` | Web アプリの公開 URL（拡張機能設定の既定値としても使用） |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI 用アクセストークン |
| `SUPABASE_PROJECT_ID` | Supabase プロジェクト参照 ID（例：`xxxxxxxxxxxxxxxxxxxx`）|
| `SUPABASE_DB_PASSWORD` | 本番 DB のパスワード |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions 内でサービスロールを使うためのキー |

手動実行も可能です。GitHub リポジトリの「Actions」→「Deploy to GitHub Pages and Supabase」→「Run workflow」から実行してください。

## GitHub Pages 公開手順

1. GitHub リポジトリの「Settings」→「Pages」を開く
2. 「Source」で「Deploy from a branch」を選択
3. 「Branch」で「main」、「Folder」で「/docs」を選択して保存
4. 数分後に `https://taifrog.github.io/ClipDesk/` でアクセス可能になる

> **Note:** リポジトリ名やオーナー名が異なる場合は、URL を適宜読み替えてください。また、`vite.config.ts` の `base` もリポジトリ名と一致するように調整してください。

## ローカル開発時の Vite プロキシ

`vite.config.ts` では、以下のプロキシが設定されています。

- `/api` → `http://localhost:3001`（旧 Express サーバー、非推奨）
- `/functions/v1` → `http://localhost:54321`（Supabase ローカル Edge Functions）

ローカル開発時は、フロントエンドから Supabase Edge Functions への呼び出しが `/functions/v1/*` 経由で行われます。
