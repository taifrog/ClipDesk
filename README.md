# ClipDesk

気になる情報や動画などをクリップして、整理もできるWebツールです。

## 技術スタック

- React 19
- TypeScript
- Vite

## 開発手順

```bash
npm install
npm run dev
```

## スクリプト

- `npm run dev` — 開発サーバーを起動
- `npm run build` — 本番用ビルド
- `npm run preview` — ビルド結果をプレビュー
- `npm run lint` — oxlint で構文チェック

## ブラウザ拡張機能（addon-chrome）

`addon-chrome/` には、Chromium ベースの Comet ブラウザ向け拡張機能があります。

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
