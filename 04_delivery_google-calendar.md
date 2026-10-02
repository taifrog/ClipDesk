# ClipDesk Googleカレンダー連携 — 納品書

作成日: 2026-10-02
対象リポジトリ: `https://github.com/taifrog/ClipDesk`（main）
ルール: `RuleForAIAgent.md` 納品フェーズ成果物
ステータス: 納品承認待ち

## 1. 納品物リスト

| 種別 | 内容 | 場所 |
|------|------|------|
| 機能 | Googleカレンダー登録 Function（POST） | `supabase/functions/google-calendar/index.ts`（新規） |
| 機能 | カレンダー一覧取得 Function（GET） | `supabase/functions/google-calendars/index.ts`（新規） |
| 機能 | 共通ヘルパー（トークン更新・作成・一覧・日時変換） | `supabase/functions/_shared/google.ts`（新規） |
| 設定 | `google_*` 8列の追加 | `supabase/migrations/0012_add_google_calendar.sql`（新規） |
| 変更 | 設定系の Notion→Google 置換 | `_shared/settings.ts`、`_shared/ai.ts`、`settings/index.ts` |
| 変更 | フロントの Notion→Google 置換＋一覧選択UI | `types.ts`、`App.tsx`、`SettingsDialog.tsx`、`ClipCard.tsx`、`ClipGrid.tsx`、`App.css` |
| 削除 | Notion Function（`tmp/` に日付付き退避、復元可） | `supabase/functions/notion-calendar/` |
| 文書 | 要件・設計・テストシナリオ・納品書 | `00_requirements_google-calendar.md`、`01_design_google-calendar.md`、`03_verification_google-calendar.md`、`04_delivery_google-calendar.md`（本書） |
| 手順 | OAuth発行〜設定の手順 | `README.md` §9（新規） |

## 2. デプロイ方法（本番反映）

main への push で GitHub Actions が自動実行する（`deploy.yml`）:

1. フロントをビルドし `docs/` に出力（Pages公開）
2. マイグレーション適用（`supabase db push`）
3. Edge Functions デプロイ（`supabase functions deploy`）
4. 拡張機能ビルド・Releases公開

今回の push 済みコミット: `f93512d`（本体）、`507a81c`（T3スコープ修正）。README 追記分は本納品で push する。

## 3. 検証結果

- T1〜T19 全項目 OK（ユーザー実機確認済み、2026-10-02）
- `tsc -b` エラー0、`oxlint` エラー0、`vite build` 成功
- `src` および `supabase/functions` 内の notion 参照0件（履歴マイグレーション `0010` のみ残存）

## 4. 既知の課題・残タスク

- 復元した登録済みクリップにはカレンダーボタンが出ない（仕様。二重登録防止のため）
- readers権限カレンダーは一覧で選択不可表示（仕様）
- 削除済み `notion-calendar` Function が Supabase ダッシュボード側に残る場合は手動削除する
- `.bak.*` バックアップは7日保持後に削除する（AGENTS.md保持ルール）

## 5. バージョン・ライセンス

- バージョン付与なし（個人利用・継続開発中のためタグ付けしない）
- LICENSE は既存のまま（変更なし）

---

納品承認をもって完了とします。承認をお願いします。
