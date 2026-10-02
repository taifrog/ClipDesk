# ClipDesk Googleカレンダー連携 — テストシナリオ

作成日: 2026-10-02
対象: `00_requirements_google-calendar.md` §7受け入れ基準
ルール: `RuleForAIAgent.md` 検証フェーズ成果物
ステータス: ユーザーテスト待ち（結果報告があるまで待機）

## 0. 前提（テスト前に完了させること）

### 0-1. Google Cloud側の準備（初回のみ・ユーザー作業）

1. [Google Cloud Console](https://console.cloud.google.com/)でプロジェクトを選択（なければ作成）する。
2. 「APIとサービス」→「ライブラリ」で **Google Calendar API** を有効化する。
3. 「APIとサービス」→「認証情報」→「認証情報を作成」→「OAuthクライアントID」→種類は「ウェブアプリケーション」で作成する。
4. Client ID と Client Secret を控える。
5. [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)を開く。右上の歯車→「Use your own OAuth credentials」にチェックし、4のID/Secretを入力する。
6. 左の一覧で「Calendar API v3」→ `https://www.googleapis.com/auth/calendar.events` にチェック→「Authorize APIs」→Googleアカウントで承認する。
7. 「Exchange authorization code for tokens」を押す。返ってきた **refresh_token** を控える（access_tokenは使い捨てなので不要）。

### 0-2. ClipDesk側の反映（ユーザー作業・いずれか）

**方法A（推奨・ローカル）:**

```powershell
cd C:\data\Github\ClipDesk
supabase start
supabase db push        # 0012 マイグレーション適用
supabase functions serve --no-verify-jwt   # 別ターミナル
npm run dev             # 別ターミナル → http://localhost:5173/
```

> 注意: `functions serve` はJWT検証を素通しするため、認証系の異常テスト（401）は方法Bで行うこと。

**方法B（本番相当）:** ブランチをpushし、Actionsのデプロイ完了後に `https://taifrog.github.io/ClipDesk/` で確認する。`supabase functions deploy google-calendar google-calendars settings` と `supabase db push` がCIで実行されること。

## 1. 設定画面テスト（FR-3 / FR-3b）

| # | 手順 | 期待結果 |
|---|------|----------|
| T1 | 設定を開き「Googleカレンダー連携設定」があること。Notionの文言がないこと | セクション表示、Notion表記なし |
| T2 | Client ID/Secret/Refresh Token/Calendar ID（既定 `kenmichi@gmail.com`）を入力→保存→ダイアログを閉じて開き直す | 「保存しました」表示、再開時に値が残る |
| T3 | 3項目入力済みで「カレンダー一覧を取得」を押す | ドロップダウンにカレンダー名（ID併記・primaryに既定表示）が出る |
| T4 | 一覧から1つ選ぶ | 入力欄にIDが反映され、保存できる |
| T5 | Client Secret未入力で「取得」を押す | ボタンが押せない（disabled） |
| T6 | Refresh Tokenをわざと間違えて保存→「取得」を押す | 「再認証が必要です。Refresh Tokenを再発行してください」と出て、手動入力にフォールバックできる |

## 2. 登録フローテスト（FR-1 / FR-2）

| # | 手順 | 期待結果 |
|---|------|----------|
| T7 | イベント開始日つきクリップのカレンダーボタンを押す | 指定カレンダーにイベント作成、ダイアログにイベントURL表示 |
| T8 | Googleカレンダー側（Web/アプリ）で確認する | タイトル・日時・場所・説明（要約＋URL＋受信日）が入っている |
| T9 | 登録後のClipDeskを確認する | 通常一覧から消え、ゴミ箱に移動している |
| T10 | 時刻なし（00:00）の開始日クリップで登録する | Google側で終日イベントになる |
| T11 | 時刻ありのクリップで登録する | 開始〜終了が時刻つきで入る（Asia/Tokyo） |
| T12 | 終了日なしのクリップで登録する | 開始と同じ値で登録される（エラーにならない） |

## 3. 異常系テスト（FR-5）

| # | 手順 | 期待結果 |
|---|------|----------|
| T13 | 登録済みクリップ（ゴミ箱のもの）を復元してもう一度押す | 二重登録にならず「既に登録されています」（409相当） |
| T14 | 開始日なしクリップにはボタンが出ないこと | ボタン非表示 |
| T15 | 未設定状態で登録を試みる（別ユーザーまたは設定クリア） | 「設定が完了していません」と案内される |
| T16 | 存在しないCalendar IDを手動入力して登録する | 「カレンダーIDを確認してください」と案内される |

## 4. 回帰テスト（非機能・互換）

| # | 手順 | 期待結果 |
|---|------|----------|
| T17 | Obsidian書き出し・AI要約・拡張機能投稿が従来通り動く | 影響なし |
| T18 | ClipDesk内カレンダー表示（CalendarView）が従来通り動く | 影響なし |
| T19 | `grep -ri notion src supabase/functions` を実行する | ヒットなし（履歴SQL `0010` のみ） |

## 5. 実装者 verified（ユーザー再確認不要）

- `npx tsc -b` エラー0、 `npm run lint` エラー0、 `npm run build` 成功（2026-10-02確認済み）。

## 6. 結果報告フォーマット

各T番号について「OK」か「NG（症状＋再現手順＋コンソール/Networkログ）」で報告してください。NGの場合は当てずっぽうで直さず、切り分けのための追加ログ依頼をします。

---

全Tクリア＋「検証完了」の承認で納品フェーズ（README追記・commit・push・リリースノート）へ進みます。
