-- ゴミ箱に入れてから7日以上経過したクリップを自動削除するための Cron ジョブを設定する

-- pg_cron 拡張を有効化（すでに有効な場合は何もしない）
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 期限切れゴミ箱クリップを物理削除する関数
-- deleted_at が NULL でなく、現在時刻から7日以上前のレコードを対象とする
-- 削除件数を PostgreSQL ログに出力する
CREATE OR REPLACE FUNCTION cleanup_expired_trash_clips()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  -- 削除した件数を保持する変数
  deleted_count INTEGER;
BEGIN
  -- deleted_at から7日以上経過したクリップを物理削除する
  DELETE FROM clips
  WHERE deleted_at IS NOT NULL
    AND deleted_at <= now() - interval '7 days';

  -- 削除件数を取得する
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  -- ログに削除件数を出力する
  RAISE LOG 'cleanup_expired_trash_clips: deleted % clips', deleted_count;
END;
$$;

-- 既存の同名ジョブがあれば削除してから再作成する（冪等性を保つ）
-- ジョブが存在しない場合、unschedule はエラーを返すため DO ブロックで例外を無視する
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-expired-trash-clips');
EXCEPTION
  WHEN OTHERS THEN
    -- ジョブが存在しない場合は無視する
    NULL;
END
$$;

-- 毎日 0 時（JST: Asia/Tokyo）に cleanup_expired_trash_clips() を実行する
SELECT cron.schedule(
  'cleanup-expired-trash-clips',
  '0 0 * * *',
  'SELECT cleanup_expired_trash_clips();'
);

-- ジョブ一覧を確認するためのコメント（必要に応じて実行）
-- SELECT * FROM cron.job;
