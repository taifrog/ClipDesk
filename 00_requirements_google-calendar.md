# ClipDesk Googleカレンダー連携 — 要件定義書

作成日: 2026-10-02
対象リポジトリ: `C:\data\Github\ClipDesk` (`https://github.com/taifrog/ClipDesk`)
前提ルール: `RuleForAIAgent.md` 要件定義フェーズ成果物
ステータス: レビュー待ち（ユーザー承認後に設計へ進む）

## 1. 目的とコアバリュー

- 誰の課題か: ClipDeskユーザー（taifrog）がWebクリップから見つけたイベント情報をカレンダーに転記する手間が大きい。
- 現状の問題: Notionデータベースへの登録機能はあるが、日常的に使うGoogleカレンダーに直接入らないため二度手間になる。n8n経由では登録できるが、ClipDesk単体では完結しない。
- 解決策: クリップのイベント情報（タイトル・開始/終了日時・場所・URL・要約）をボタン一つでGoogleカレンダーに登録できるようにする。n8nを使わずClipDesk単体で完結させる。
- 成功の姿: イベント情報つきクリップ → カード上のカレンダー登録ボタン → Googleカレンダーにイベント作成 → クリップはゴミ箱へ移動。設定画面で登録先カレンダーを変えられる。

## 2. 動作環境・前提環境

- フロントエンド: React 19 + TypeScript + Vite（既存のまま）。ホスティングはGitHub Pages（`docs/`）。
- バックエンド: Supabase（Postgres + Auth + Edge Functions / Deno）。ローカル開発はSupabase CLI。
- ブラウザ: Chromium系（Chrome / Comet）最新。拡張機能の改修は不要。
- Google側前提:
  - ユーザーがGoogleアカウント（既定 `kenmichi@gmail.com`、変更可）を持つこと。
  - Google Cloudプロジェクトで Calendar API v3 を有効化し、OAuthクライアント（Webアプリ）を作成済みであること。
  - スコープは `https://www.googleapis.com/auth/calendar.events`（イベントの作成のみ。既存の予定の読み取りはしない）。
  - リフレッシュトークンを1回取得し、ClipDesk設定画面に保存すること（取得手順は納品マニュアルに記載）。
- タイムゾーン: Asia/Tokyo固定（n8nワークフローと同一）。

## 3. 機能要件

### FR-1 Googleカレンダーへイベントを登録する（B方式: Edge Function + リフレッシュトークン）

- 対象: `event_start_date` が設定されたクリップ（終了日・場所は任意）。
- 操作: クリップカードの登録ボタン（現行のNotionボタンを置換）を押す。
- 処理フロー:
  1. フロントが `POST /functions/v1/google-calendar { clipId }` を呼ぶ（JWT認証）。
  2. Edge Functionがクリップ所有権・未削除・未登録を検証する。
  3. `app_settings` からGoogle連携設定を取得する。
  4. `refresh_token + client_id + client_secret` で `https://oauth2.googleapis.com/token` から `access_token` を取得する。
  5. `POST https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events` でイベントを作成する。
  6. 成功したら `clips` を更新し、ゴミ箱へ移動する（`deleted_at = exported_at`）。
- イベントマッピング:
  - `summary`: クリップタイトル（空なら「（タイトルなし）」）。
  - `description`: 要約 + URL + 受信日（例: `URL: ...\n\n要約:\n...`）。URLは必ず含める。
  - `location`: クリップの `location`（あれば）。
  - `start` / `end`: 開始日時必須、終了日時任意。時刻なし日付は終日イベント（`date`）として登録し、時刻ありは `dateTime` + `timeZone: Asia/Tokyo` で登録する。終了日時がない場合は開始と同じ値または終日1日とする。
- 登録先: 設定画面のカレンダーID（既定 `kenmichi@gmail.com`、空なら `primary`）。

### FR-2 登録後の状態管理

- 成功後は現行Notionと同一: `google_exported = true`、`google_exported_at`、`google_event_id`、`google_event_url`（`htmlLink`）を保存し、同時に `deleted_at` を設定してゴミ箱へ移動する。
- 二重登録防止: 既登録クリップへの再実行は409で拒否する。
- フロントは成功後に通常一覧から除去し、ゴミ箱一覧へ楽観更新＋成功ダイアログにイベントURLを表示する。

### FR-3 設定画面でGoogle連携を設定できる

- 設定項目（`SettingsDialog` に「Googleカレンダー連携設定」セクション新設）:
  - Client ID（OAuthクライアントID）
  - Client Secret（パスワード入力）
  - Refresh Token（パスワード入力）
  - Calendar ID（既定 `kenmichi@gmail.com`、空なら `primary` 扱い）
- 保存先: `app_settings` の `google_*` カラム（ユーザー単位）。保存・取得は既存 `settings` Edge Functionを拡張する。
- 未設定時のガード: 未設定で登録ボタンを押したら「設定が完了していません」と案内する。

### FR-3b 登録先カレンダーを一覧から選択できる（2026-10-02追加）

- 背景: ユーザーがGoogleカレンダーに複数のカレンダーを持っている場合、ID直打ちでは選びにくい。
- 機能: 設定画面のCalendar ID欄を「一覧から選択 + 手動入力併用」にする。
  1. Client ID / Secret / Refresh Tokenが保存済みなら「カレンダー一覧を取得」ボタンを押せる。
  2. フロントが `GET /functions/v1/google-calendars`（JWT認証）を呼ぶ。Edge Functionがトークンをリフレッシュし、`GET https://www.googleapis.com/calendar/v3/users/me/calendarList` で一覧（`id` / `summary` / `primary` / `accessRole`）を取得して返す。
  3. 取得結果をドロップダウンに表示し、選択したらCalendar ID欄に反映して保存する。手動入力欄も残し、共有カレンダー等のID直打ちも可能にする。
  4. 取得失敗時（未設定・invalid_grant・403）はFR-5のメッセージで案内し、ドロップダウンは空のまま手動入力にフォールバックする。
- 表示名は `summary`（例: 仕事・家族）を出し、IDは括弧書きで添える。`primary` には「（既定）」を付ける。
- 書込権限のないカレンダー（`accessRole: reader`）は一覧に出すが選択時に警告する、または除外する（設計で確定）。
- スコープ追加は不要: `calendar.events` で `calendarList.list` は取得可能。フル `calendar` スコープへの拡大はしない。

### FR-4 Notionカレンダー機能の撤去

- 撤去対象:
  - Edge Function `supabase/functions/notion-calendar/`
  - `_shared/settings.ts` の `NotionSettings` / `saveNotionSettings` / `getAppSettings.notion`
  - `_shared/ai.ts` の `NotionSettings`
  - `settings/index.ts` のNotion分岐
  - フロント `types.ts` の `NotionSettings`、関連state、`SettingsDialog` のNotionセクション、`ClipCard` / `ClipGrid` / `App.tsx` のNotionボタン・ハンドラ・デフォルト値
  - マイグレーション `0010_add_notion_settings.sql` 自体は残す（履歴）が、新規マイグレーションで `google_*` を追加する。`notion_*` カラムはDBには残し、コードからは参照しない（既登録履歴の保全）。
- UI文言から「Notion」を除去し、READMEの該当記述を更新する。

### FR-5 エラーハンドリングとメッセージ

- 開始日なし: 400「イベント開始日が登録されていません」。
- 設定不足: 400「Google連携設定が完了していません（Client ID / Secret / Refresh Token）」。
- Google認証失敗（invalid_grant等）: 401相当で「再認証が必要です。Refresh Tokenを再発行してください」と案内する。
- スコープ不足・権限なし（403）: n8nで起きた読み取り専用スコープ問題と同様のため、メッセージにスコープ確認を含める。
- カレンダーID不正（404）: 「カレンダーIDを確認してください」と案内する。
- フロントは `alert` または既存ダイアログ流儀で表示する（新規UIフレームワーク導入なし）。

## 4. 実装しない機能（Out of Scope）

- n8nワークフロー自体の改修・削除（既存の `OpenClaw → Google Calendar 登録` は残す）。
- Google予定の読み取り・一覧・編集・削除の双方向同期（今回は作成のみ）。
- 繰り返しイベント（RRULE）の作成。
- 複数カレンダーへの同時登録。
- フロント直接OAuth（GISポップアップ）方式、サービスアカウント方式、APIキー方式。
- 添付ファイル・ゲスト招待（attendees）の登録。
- Notion併存・切り替えスイッチ（今回は完全撤去）。

## 5. 非機能要件・制約

- セキュリティ: Client Secret / Refresh Tokenはフロントに平文表示しない（取得時はマスク、保存はupsert）。ログにトークンを出さない。Edge Functionのdebug出力に秘密を含めない。
- 権限: Supabase AuthのJWT検証は既存流儀（user clientで `getUser`、DB操作はservice_role）を踏襲する。RLSを迂回しない。
- 日時: 入力はISO 8601（+09:00）を想定し、Google APIにはRFC3339で送る。終日/時刻ありの判定は `T` の有無と時刻 `00:00` の扱いで設計時に確定する。
- 性能: トークンリフレッシュ+1回のevents.insertのみ。リトライはしない（失敗時はエラーを返し、ユーザー再試行）。
- 互換: 既存のObsidian連携・AI要約・拡張機能・カレンダー表示（`CalendarView`）に影響を与えない。`CalendarView` 自体はClipDesk内表示のまま残す。
- 品質ゲート: `tsc -b` エラー0、`vite build` 成功、`oxlint` エラー0。 SupabaseローカルでのEdge Function動作確認（または `deno check` 相当）。

## 6. データ・設定の変更概要（設計への申し送り）

- 新規マイグレーション `0012_add_google_calendar_settings.sql`（仮）:
  - `app_settings` に `google_client_id TEXT DEFAULT ''`、`google_client_secret TEXT DEFAULT ''`、`google_refresh_token TEXT DEFAULT ''`、`google_calendar_id TEXT DEFAULT 'kenmichi@gmail.com'` を追加。
  - `clips` に `google_exported BOOLEAN DEFAULT FALSE`、`google_exported_at TIMESTAMPTZ`、`google_event_id TEXT`、`google_event_url TEXT` を追加。
- 新規Edge Function `supabase/functions/google-calendar/index.ts`（notion-calendarを雛形に。`POST` でイベント作成）。
- カレンダー一覧取得用 `supabase/functions/google-calendars/index.ts`（`GET` でcalendarList.listを代理取得。FR-3b用）。
- `settings` Functionと `_shared/settings.ts` にGoogle分岐を追加し、Notion分岐を削除。
- フロント型・UIのNotion→Google置換（詳細は設計書でファイル単位に列挙）。

## 7. 受け入れ基準

- [ ] 設定画面でカレンダー一覧を取得し、ドロップダウンから登録先を選べる。手動入力も可能。
- [ ] 開始日つきクリップのボタン押下で指定カレンダーにイベントが作成され、URLが返る。
- [ ] 成功後にクリップがゴミ箱へ移動し、`google_*` が記録される。
- [ ] 二重登録が409で拒否される。開始日なし・設定不足で適切なエラーが出る。
- [ ] NotionのUI・Function・文言が残っていない（`grep -ri notion src supabase/functions` がヒットしない。履歴SQL・README履歴除く）。
- [ ] `npm run build` と `npx tsc -b` と `npm run lint` が通る。

## 8. 要確認・ユーザー決定済み事項

- 決定済み: B方式、Notion撤去、成功後ゴミ箱、Calendar ID可変（既定 `kenmichi@gmail.com`）。
- 納品時に必要なもの: Google CloudでのClient ID/Secret発行とRefresh Token取得手順をマニュアル化する（OAuth Playgroundまたは `gcloud` 手順）。
- スコープは `calendar.events`（イベント作成）＋ `calendar.calendarlist.readonly`（一覧取得、2026-10-02検証で追加）の2つとする。`calendarList.list` は `calendar.events` では403になるため。フル `calendar` への拡大はしない。

---

承認をもって設計フェーズ（`01_design.md`）に進みます。承認・修正指示をお願いします。
