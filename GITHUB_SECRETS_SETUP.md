# GitHub Secrets 設定手順

GitHub Actions から Supabase へデプロイし、Chrome 拡張機能を GitHub Releases に公開するために、以下の Secrets を設定してください。

## 設定場所

1. ブラウザで GitHub リポジトリを開く  
   `https://github.com/taifrog/ClipDesk`
2. 上部メニューの **Settings** をクリック
3. 左サイドメニューの **Secrets and variables → Actions** を選択
4. **Repository secrets** タブの **New repository secret** ボタンをクリック
5. Name と Secret を入力して **Add secret**

## 必要な Secrets

### 1. `VITE_SUPABASE_URL`

- **Supabase ダッシュボード**（`https://supabase.com/dashboard`）で対象プロジェクトを開く
- 左メニュー **Project Settings → API** を選択
- **Project URL** の欄にある URL をコピー
  - 例：`https://xxxxxxxxxxxxxxxxxxxx.supabase.co`

### 2. `VITE_SUPABASE_ANON_KEY`

- 同じ **Project Settings → API** ページ
- **Project API keys** の中から **`anon` `public`** と書かれたキーをコピー
  - 例：`eyJhbGciOiJIUzI1NiIs...`

### 3. `SUPABASE_ACCESS_TOKEN`

- Supabase ダッシュボード右上のアイコンから **Account Preferences** を開く
- 左メニューの **Access Tokens** を選択
- **New access token** をクリックしてトークンを発行
- 表示されたトークンをコピー（一度しか表示されません）

### 4. `SUPABASE_DB_PASSWORD`

- Supabase プロジェクト作成時に設定したデータベースのパスワード
- 忘れた場合は、ダッシュボードの **Project Settings → Database** からリセット可能

### 5. `SUPABASE_PROJECT_ID`

- Supabase ダッシュボードの **Project Settings → General** を開く
- **Reference ID** の値をコピー
  - 例：`xxxxxxxxxxxxxxxxxxxx`

### 6. `SUPABASE_SERVICE_ROLE_KEY`

- **Project Settings → API** ページを開く
- **Project API keys** の中から **`service_role` `secret`** と書かれたキーをコピー
  - 例：`eyJhbGciOiJIUzI1NiIs...`
  - このキーは Edge Functions 内で管理操作を行うために使用します。外部に漏らさないよう注意してください

### 7. `VITE_SITE_URL`（オプションだが推奨）

- ClipDesk Web アプリを公開している URL を設定してください
- 例：`https://taifrog.github.io/ClipDesk/`
- この値は、Chrome 拡張機能の `siteUrl` 既定値として使用されます
- 未設定の場合、拡張機能のオプション画面には同じ URL が既定値として表示されますが、ビルド時に正しい値を確定させるため設定してください

## 設定後

Secrets を全て登録したら、GitHub リポジトリの **Actions** タブを開き、
**Deploy to GitHub Pages and Supabase** workflow を手動で実行してください。

workflow の完了後、GitHub Releases に `ClipDesk Chrome Addon vX.Y.Z` という名前のリリースが作成され、拡張機能の zip ファイルが添付されます。
