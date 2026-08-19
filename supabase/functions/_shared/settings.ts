// アプリ設定取得用ヘルパー

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.0';
import { AiSummarySettings, ObsidianSettings } from './ai.ts';

// AI要約設定のデフォルト値
const DEFAULT_AI_SUMMARY_SETTINGS: AiSummarySettings = {
  enabled: true,
  apiKey: '',
  model: 'gpt-4o-mini',
  language: 'ja',
};

// Obsidian 連携設定のデフォルト値
const DEFAULT_OBSIDIAN_SETTINGS: ObsidianSettings = {
  apiKey: '',
  folder: 'ClipDesk',
  filenameTemplate: '{{title}}',
  noteTemplate: `---
registered_at: {{registeredAt}}
url: {{url}}
title: {{title}}
event_start_date: {{eventStartDate}}
event_end_date: {{eventEndDate}}
location: {{location}}
category: {{category}}
comment: {{comment}}
---

# {{title}}

URL: {{url}}

## 要約

{{summary}}

## コメント

{{comment}}
`,
};

// アプリ設定全体（AI 要約設定 + Obsidian 連携設定）
export interface AppSettings {
  aiSummary: AiSummarySettings;
  obsidian: ObsidianSettings;
}

// 指定ユーザーのアプリ設定全体を取得する
// レコードが存在しない場合や各フィールドが未設定の場合はデフォルト値を返す
export async function getAppSettings(
  supabase: SupabaseClient,
  userId: string,
): Promise<AppSettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .select(
      'ai_summary_enabled, ai_summary_api_key, ai_summary_model, ai_summary_language, obsidian_api_key, obsidian_folder, obsidian_filename_template, obsidian_note_template',
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return {
      aiSummary: DEFAULT_AI_SUMMARY_SETTINGS,
      obsidian: DEFAULT_OBSIDIAN_SETTINGS,
    };
  }

  // モデル名はユーザーが自由に指定できるようにする。空文字や未定義の場合のみデフォルト値を使用する。
  const aiModel = data.ai_summary_model ? data.ai_summary_model : DEFAULT_AI_SUMMARY_SETTINGS.model;

  return {
    aiSummary: {
      enabled: data.ai_summary_enabled ?? DEFAULT_AI_SUMMARY_SETTINGS.enabled,
      apiKey: data.ai_summary_api_key ?? DEFAULT_AI_SUMMARY_SETTINGS.apiKey,
      model: aiModel,
      language: data.ai_summary_language ?? DEFAULT_AI_SUMMARY_SETTINGS.language,
    },
    obsidian: {
      apiKey: data.obsidian_api_key ?? DEFAULT_OBSIDIAN_SETTINGS.apiKey,
      folder: data.obsidian_folder ?? DEFAULT_OBSIDIAN_SETTINGS.folder,
      filenameTemplate: data.obsidian_filename_template ?? DEFAULT_OBSIDIAN_SETTINGS.filenameTemplate,
      noteTemplate: data.obsidian_note_template ?? DEFAULT_OBSIDIAN_SETTINGS.noteTemplate,
    },
  };
}

// 指定ユーザーの AI 要約設定を保存する
export async function saveAiSummarySettings(
  supabase: SupabaseClient,
  userId: string,
  settings: Partial<AiSummarySettings>,
): Promise<AiSummarySettings> {
  // モデル名はユーザーが自由に指定できるようにする。空文字や未定義の場合のみデフォルト値を使用する。
  const model = settings.model ? settings.model : DEFAULT_AI_SUMMARY_SETTINGS.model;
  const upsert = {
    user_id: userId,
    ai_summary_enabled: typeof settings.enabled === 'boolean' ? settings.enabled : undefined,
    ai_summary_api_key: typeof settings.apiKey === 'string' ? settings.apiKey : undefined,
    ai_summary_model: model,
    ai_summary_language: typeof settings.language === 'string' ? settings.language : undefined,
  };

  await supabase.from('app_settings').upsert(upsert, { onConflict: 'user_id' });
  const updated = await getAppSettings(supabase, userId);
  return updated.aiSummary;
}

// 指定ユーザーの Obsidian 連携設定を保存する
export async function saveObsidianSettings(
  supabase: SupabaseClient,
  userId: string,
  settings: Partial<ObsidianSettings>,
): Promise<ObsidianSettings> {
  const upsert = {
    user_id: userId,
    obsidian_api_key: typeof settings.apiKey === 'string' ? settings.apiKey : undefined,
    obsidian_folder: typeof settings.folder === 'string' ? settings.folder : undefined,
    obsidian_filename_template: typeof settings.filenameTemplate === 'string'
      ? settings.filenameTemplate
      : undefined,
    obsidian_note_template: typeof settings.noteTemplate === 'string'
      ? settings.noteTemplate
      : undefined,
  };

  await supabase.from('app_settings').upsert(upsert, { onConflict: 'user_id' });
  const updated = await getAppSettings(supabase, userId);
  return updated.obsidian;
}
