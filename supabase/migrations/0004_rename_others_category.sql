-- 既存の "others" カテゴリ名を「未分類」に統一する
-- collect Edge Function や過去のデータで "その他" と登録されていた場合に修正する
UPDATE categories
SET name = '未分類'
WHERE id = 'others';
