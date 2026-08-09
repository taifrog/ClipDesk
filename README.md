# ClipDesk

気になる情報や動画などをクリップして、整理もできるWebツールです。

## 技術スタック

- React 19
- TypeScript
- Vite
- Express
- better-sqlite3

## スクリプト

- `npm run dev` — フロントエンド開発サーバーを起動
- `npm run server` — API サーバー（SQLite）を起動
- `npm run build` — 本番用ビルド
- `npm run preview` — ビルド結果をプレビュー
- `npm run lint` — oxlint で構文チェック

## 利用手順

ClipDesk は「Webサイト」「APIサーバー」「ブラウザ拡張機能」の3つで動作します。

### 1. 依存関係をインストールする

```bash
cd c:/data/Github/ClipDesk
npm install
```

### 2. API サーバーを起動する

SQLite ファイルでクリップとカテゴリを永続化します。

```bash
npm run server
```

`http://localhost:3001/` で API サーバーが待ち受けます。

### 3. フロントエンド開発サーバーを起動する

別のターミナルで実行してください。

```bash
npm run dev
```

`http://localhost:5173/`（ポートが使われている場合は `http://localhost:5174/` など）でサイトが開きます。

### 4. 拡張機能をビルドする

別のターミナルで実行してください。

```bash
cd c:/data/Github/ClipDesk/addon-chrome
npm install
npm run build
```

ビルド後、`addon-chrome/dist/` に読み込み可能な拡張機能が生成されます。

### 5. ブラウザに拡張機能を読み込む

1. Chrome または Comet で `chrome://extensions/` を開く
2. 「デベロッパー モード」を有効化
3. 「パッケージ化されていない拡張機能を読み込む」で `addon-chrome/dist` を選択

### 6. 拡張機能のオプションを設定する

拡張機能アイコンを右クリック →「オプション」から、以下を設定してください。

- **OpenCode Go API キー**
- **投稿先 URL**: `http://localhost:3001/api/clip`
- **使用モデル**: 例 `gpt-4o-mini`
- **要約の言語**: 例 `ja`

### 7. クリップを投稿する

1. 要約したいページを開く
2. 拡張機能アイコンをクリック
3. 「要約して投稿」ボタンを押す
4. ClipDesk サイトに要約結果が投稿される

### 8. サイトで整理する

- 左サイドバーからカテゴリを選択してフィルタリング
- クリップカードをドラッグ＆ドロップでサイドバーのカテゴリに分類
- 星アイコンでピン留め
- カード下部の「コメントを追加…」からメモを追加

## ブラウザ拡張機能（addon-chrome）

`addon-chrome/` には、Chromium ベースのブラウザ向け拡張機能があります。

### 機能

- アクティブなタブの URL・タイトル・本文を取得
- OpenCode Go（OpenAI 互換 API）で本文を要約
- 要約結果を ClipDesk ローカルサイトに投稿

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

- OpenCode Go API キー
- 投稿先 ClipDesk ローカルサイト URL
- 使用モデル（例：`gpt-4o-mini`）
- 要約の言語（例：`ja`）
