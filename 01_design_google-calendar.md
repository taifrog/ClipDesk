# ClipDesk Googleカレンダー連携 — 設計書

作成日: 2026-10-02
前提: `00_requirements_google-calendar.md` 承認済み（FR-1〜FR-5 + FR-3b）
ステータス: レビュー待ち（ユーザー承認後にコーディングへ進む）
方針: 実装コードは書かない。構成・分割・I/O・制約対処・エラー設計に集中する。

## 1. アーキテクチャと全体構成

### 1.1 現行（Notion）と新構成の対比

```text
現行:
[ClipCard Nボタン] → POST /functions/v1/notion-calendar {clipId}
  → notion-calendar(Function) → Notion API → clips.notion_* 更新 + deleted_at → ゴミ箱

新構成:
[ClipCard Gボタン] → POST /functions/v1/google-calendar {clipId}
  → google-calendar(Function) → oauth2.googleapis.com/token → calendar v3 events.insert
  → clips.google_* 更新 + deleted_at → ゴミ箱

[設定画面] → GET /functions/v1/google-calendars
  → google-calendars(Function) → oauth2.googleapis.com/token → calendarList.list
  → ドロップダウン表示 → 選択値を app_settings.google_calendar_id に保存
```

### 1.2 処理フロー（イベント登録）

1. フロント `handleExportToGoogle(clip)` が未設定・開始日なしを事前ガードする。
2. `POST google-calendar` に `{ clipId }` を送る（Authorization: Bearer JWT）。
3. Functionが `getUserClient.getUser()` でuserId確定、`getServiceClient` でDB操作する（既存流儀踏襲）。
4. clipsを `eq id, user_id, deleted_at IS NULL` で取得する。
5. `getAppSettings` でgoogle設定を取得し、不足を400で返す。
6. 共通ヘルパーで `access_token` を取得（リフレッシュフロー）。
7. クリップ→Googleイベント変換ヘルパーでリクエストボディを組み立てる。
8. `events.insert` を呼ぶ。成功で `pageId/pageUrl` 相当の `eventId/eventUrl(htmlLink)` を得る。
9. clipsを `google_exported=true, google_exported_at, google_event_id, google_event_url, deleted_at` で更新する。
10. フロントは通常一覧から除去し、ゴミ箱へ楽観追加＋URL付きダイアログを出す。

### 1.3 処理フロー（カレンダー一覧取得 FR-3b）

1. 設定画面でClient ID/Secret/Refresh Token入力済みが条件。「カレンダー一覧を取得」ボタンで `GET google-calendars` を呼ぶ。
2. Functionが同様に認証→設定取得→トークンリフレッシュ→ `GET calendarList.list(minAccessRole=writer相当はクライアント側フィルタ)` を呼ぶ。
3. 応答を `{ calendars: [{ id, summary, primary, accessRole }] }` に正規化して返す（最大250件、pageToken追従は最大1〜2ページ）。
4. フロントは `writer/owner` のみ選択可にし、`reader` は「読み取り専用のため選択不可」とグレー表示する。手動入力欄は残す。

### 1.4 依存関係

- 外部API: `https://oauth2.googleapis.com/token`、`https://www.googleapis.com/calendar/v3/...` のみ。npm新規依存なし。Deno標準fetch使用。
- 削除依存: Notion API（`api.notion.com`）への参照を全除去する。
- スコープ: `https://www.googleapis.com/auth/calendar.events` のみ。`calendarList.list` は同スコープで取得可能のため拡大しない。

## 2. モジュール分割（単一責任）

| # | モジュール | 役割 | 新規/変更 |
|---|-----------|------|-----------|
| M1 | `supabase/migrations/0012_add_google_calendar.sql` | `app_settings.google_*` 4列 + `clips.google_*` 4列を追加する | 新規 |
| M2 | `supabase/functions/_shared/google.ts` | トークンリフレッシュ・一覧取得・イベント作成・日時変換・エラー正規化の共通ロジック | 新規 |
| M3 | `supabase/functions/google-calendar/index.ts` | POSTイベント作成の入出力・認証・バリデーション・DB更新（notion-calendar雛形） | 新規 |
| M4 | `supabase/functions/google-calendars/index.ts` | GET一覧取得の入出力・認証・代理取得（読取のみ、DB更新なし） | 新規 |
| M5 | `supabase/functions/_shared/settings.ts` | `getAppSettings` にgoogle追加、`saveGoogleSettings` 追加、`saveNotionSettings`・notion分岐削除 | 変更 |
| M6 | `supabase/functions/_shared/ai.ts` | `NotionSettings` 型削除、`GoogleCalendarSettings` 型追加 | 変更 |
| M7 | `supabase/functions/settings/index.ts` | google保存分岐追加、notion保存分岐削除 | 変更 |
| M8 | `supabase/functions/notion-calendar/` | ディレクトリごと削除（デプロイ対象から除外） | 削除 |
| M9 | `src/types.ts` | `NotionSettings` 削除、`GoogleCalendarSettings` 追加。`Clip` のnotion_* → google_* 置換 | 変更 |
| M10 | `src/App.tsx` | state・fetch・保存ハンドラ・登録ハンドラ・一覧取得ハンドラのNotion→Google置換 | 変更 |
| M11 | `src/components/SettingsDialog.tsx` | Google連携セクション新設（一覧取得ボタン+ドロップダウン+手動入力）、Notion節削除 | 変更 |
| M12 | `src/components/ClipCard.tsx` + `ClipGrid.tsx` | Nボタン→Gカレンダーボタン（`onExportToGoogle`）、`notionExported` 参照→ `googleExported` | 変更 |
| M13 | `src/App.css` | `.clip-card-notion` → `.clip-card-google` へ改名（見た目は継承） | 変更 |
| M14 | `README.md` + `00_requirements_google-calendar.md` 追記 | 手順書にGoogle Cloud発行手順・Refresh Token取得法を追記 | 変更（納品時） |

トレーサビリティ: FR-1→M2/M3/M5/M6/M7/M9/M10/M12、FR-2→M1/M3/M10、FR-3→M1/M5/M7/M9/M10/M11、FR-3b→M2/M4/M11、FR-4→M5〜M13全般、FR-5→M2/M3/M4/M10/M11。

## 3. データ構造とインターフェース

### 3.1 DB（マイグレーション M1）

```sql
ALTER TABLE app_settings
  ADD COLUMN IF NOT EXISTS google_client_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS google_client_secret TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS google_refresh_token TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT NOT NULL DEFAULT 'kenmichi@gmail.com';

ALTER TABLE clips
  ADD COLUMN IF NOT EXISTS google_exported BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS google_exported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_event_url TEXT;
```

- `notion_*` 列は削除しない（既登録履歴保全）。コード参照のみ除去する。
- RLS変更なし。既存ポリシーでユーザー単位アクセスを維持する。

### 3.2 型（M6/M9）

```ts
interface GoogleCalendarSettings {
  clientId: string;      // OAuthクライアントID
  clientSecret: string;  // OAuthクライアントシークレット（保存時のみ送信、取得時はマスクしない＝既存Notion流儀。表示はpassword欄）
  refreshToken: string;  // リフレッシュトークン
  calendarId: string;    // 登録先ID。既定 kenmichi@gmail.com、空は primary 扱い
}
interface Clip {
  googleExported?: boolean;
  googleExportedAt?: string | null;
  googleEventId?: string | null;
  googleEventUrl?: string | null;
  // notion_* は削除する
}
```

### 3.3 Edge Function I/O

POST `/google-calendar`（M3）:

```json
// Request
{ "clipId": 123 }
// Success 200
{ "ok": true, "eventId": "abc123", "eventUrl": "https://www.google.com/calendar/event?eid=...", "exportedAt": "2026-10-02T01:00:00.000Z", "calendarId": "kenmichi@gmail.com" }
// Error例
{ "error": "イベント開始日が登録されていません" } // 400
{ "error": "Google連携設定が完了していません" } // 400
{ "error": "再認証が必要です。Refresh Tokenを再発行してください" } // 401 (invalid_grant)
{ "error": "権限がありません。スコープ https://www.googleapis.com/auth/calendar.events を確認してください" } // 403
{ "error": "カレンダーIDを確認してください" } // 404
{ "error": "このクリップは既に Googleカレンダーに登録されています" } // 409
```

GET `/google-calendars`（M4）:

```json
// Success 200
{ "calendars": [{ "id": "kenmichi@gmail.com", "summary": "メイン", "primary": true, "accessRole": "owner" }] }
// ErrorはPOSTに準じる（設定不足400、再認証401、権限403）
```

POST `/settings` 拡張（M7）: 既存snake_case流儀で以下を受けたらgoogle保存分岐に入る。

```json
{ "googleClientId": "...", "googleClientSecret": "...", "googleRefreshToken": "...", "googleCalendarId": "..." }
```

### 3.4 Google API呼び出し仕様（M2）

トークンリフレッシュ:

```text
POST https://oauth2.googleapis.com/token
Content-Type: application/x-www-form-urlencoded
body: client_id=...&client_secret=...&refresh_token=...&grant_type=refresh_token
→ { access_token, expires_in } を取得する。失敗時は invalid_grant/invalid_client を上位に伝える。
```

イベント作成:

```text
POST https://www.googleapis.com/calendar/v3/calendars/{encodeURIComponent(calendarId)}/events
Authorization: Bearer {access_token}
{
  "summary": "タイトル",
  "description": "要約...\n\nURL: https://...\n受信日: 2026-10-02",
  "location": "会場（あれば）",
  "start": { "dateTime": "2026-10-05T10:00:00+09:00", "timeZone": "Asia/Tokyo" },
  "end": { "dateTime": "2026-10-05T11:00:00+09:00", "timeZone": "Asia/Tokyo" }
}
```

### 3.5 日時変換ルール（M2）

- 入力はclipsの `event_start_date/event_end_date`（ISO 8601、+09:00付きを想定）。
- 終日判定: 開始の時刻部が `00:00:00` かつ（終了なし or 終了が開始と同日）→ 終日イベントとして `{ "date": "YYYY-MM-DD" }` で送る。終了がある場合はGoogle仕様の排他的終了にするため `end.date = 終了日+1日`（終了なし終日は `start+1日`）。
- 時刻あり: `dateTime` + `timeZone: Asia/Tokyo` で送る。終了なしなら開始と同じ値にする（Notionの単日登録と同等）。
- 不正日時は400で返す（Googleに投げない）。

### 3.6 状態保持

- 選択中カレンダーIDは `app_settings.google_calendar_id` に永続化する。フロントの一時選択はSettingsDialogのローカルstateに保持し、保存ボタンで確定する。
- 一覧結果はキャッシュしない（取得ボタン都度取得）。保存済みIDが一覧にない場合も手動値として許容する。

## 4. プラットフォーム制約への対処

- Deno Edge: npm依存追加なし、標準fetchのみ。`encodeURIComponent` でカレンダーID（メールアドレスの `@` 含む）をエスケープする。
- Supabase CLI: 新Functionは `supabase/functions/<name>/index.ts` 配置で自動検出される。`notion-calendar` 削除後は `supabase functions deploy` 対象から外れる。削除済みFunctionのサーバー側残留はダッシュボード手動削除またはCLI再デプロイで対処する（納品手順に記載）。
- GitHub Pages: フロントのみ。環境変数追加なし（`VITE_*` 変更なし）。
- CORS: 既存 `corsHeaders/handleCors` を両Functionで使う。GETにも `Access-Control-Allow-Methods` が含まれているため追加変更なし。
- 日時: DBはTIMESTAMPTZ、GoogleはRFC3339。変換はM2に集約し、フロントでの再変換はしない。

## 5. エラーハンドリングとエッジケース

| ケース | 検出 | 応答/表示 | フォールバック |
|---|---|---|---|
| 未ログイン/JWT不正 | M3/M4冒頭 | 401 認証が必要です | ログイン画面へ誘導（既存流儀） |
| clipId不正 | 数値検証 | 400 clipIdが不正です | 再選択を促す |
| 他人のclip/削除済み/なし | 所有権検索 | 404 クリップが見つかりません | 一覧再取得 |
| 開始日なし | null検証 | 400 開始日が必要です | イベント編集を促す |
| 設定不足 | 空文字検証 | 400 設定が完了していません | 設定ダイアログを開く |
| invalid_grant/expired | token API 400 | 401 再発行してください | 手動入力欄に留める |
| 403 scope不足 | events.insert 403 | 403 スコープ確認案内 | n8n同様の再認証手順へ |
| 404 calendarId不正 | events.insert 404 | 404 ID確認案内 | 一覧再取得→選択し直し |
| 二重登録 | google_exported | 409 既に登録されています | ボタン非表示（フロントで `googleExported` なら出さない） |
| reader権限選択 | accessRole検証 | 設定画面で警告表示、保存は許すが登録時に403案内 | owner/writer推奨表示 |
| 一覧取得失敗 | calendarList非200 | 設定画面にエラー文、手動入力へ | 手動IDで登録は試せる |
| Google 5xx/429 | 非200 | 500 一時的なエラー、再試行案内 | リトライはユーザー操作に委ねる（自動再送なし） |

- 秘密漏洩防止: エラーメッセージに `client_secret/refresh_token/access_token` を含めない。ログはID・ステータスのみ。
- 二重送信防止: 登録ボタン押下中はdisabledにする（既存Obsidian一括処理と同UX）。

## 6. フロント変更の要点（M10/M11/M12/M13）

- `SettingsDialog`: Notion節をGoogle節に置換する。入力4項目 +「一覧を取得」ボタン + select + ステータス文。保存時は `googleClientId/...` でPOSTする。取得ボタンは3項目入力済みのときのみ活性化する。
- `App.tsx`: `notionSettings/handleSaveNotionSettings/handleExportToNotion` をgoogle版に置換し、`fetchCalendars` ハンドラを追加する。`normalizeApiClip` のnotion_*→google_*置換を忘れない。
- `ClipCard/ClipGrid`: `onExportToNotion`→`onExportToGoogle`、`clip.eventStartDate && !clip.googleExported` でGボタンを出す。NロゴSVG→カレンダーSVGに差し替える。
- CSS: クラス名のみ改名し、スタイル定義は流用する。

## 7. 検証方針（コーディング後に実施）

- 静的: `npx tsc -b`、`npm run build`、`npm run lint` が通る。`grep -ri notion src supabase/functions` が履歴SQL以外ヒットしない。
- 動的: Supabaseローカルでマイグレーション適用→設定保存→一覧取得→イベント作成→ゴミ箱移動→二重登録409を順に確認する。テストシナリオは検証フェーズで別途提示する。

---

承認をもってコーディングフェーズに進みます。承認・修正指示をお願いします。
