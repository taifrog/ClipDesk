# 作業進捗

- [x] サーバー側に AI 要約設定 API と要約関数を実装
- [x] サイト設定の型定義を追加（src/types.ts）
- [x] 設定ダイアログに AI 要約設定 UI を追加（src/components/SettingsDialog.tsx）
- [x] App.tsx で設定の取得・保存を連携
- [x] /api/collect で AI 要約を実行するように改修
- [x] TypeScript / 構文チェック
- [x] Supabase 移行：クライアント設定・認証 UI・App.tsx 改修
- [x] Edge Functions 対応：clip / clips / categories / source-sites / settings / collect
- [x] Vite プロキシ・環境変数例を追加
- [x] Chrome 拡張機能を Supabase Edge Functions に対応（options / background / manifest）
- [x] 拡張機能用 API キー管理 Edge Function（user-api-keys）を作成
- [x] Web アプリに拡張用 API key 管理 UI を追加
- [x] 旧 Express サーバー関連ファイルの非推奨コメント追加
- [x] GitHub Actions workflow（.github/workflows/deploy.yml）の作成
- [x] README の Supabase / 拡張機能 / CI-CD セットアップ更新
- [x] package.json の server スクリプトへの非推奨コメント追加（README のスクリプト説明で対応）
- [x] 全体の TypeScript / ビルド / 動作検証
