/// <reference lib="deno.ns" />
// クリップ収集用 Edge Function
// 登録済みの収集元サイトから RSS/スクレイピングで記事を収集し、クリップとして登録する。

import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getServiceClient, getUserClient, getJwt } from '../_shared/supabase.ts'
import { getAppSettings } from '../_shared/settings.ts'
import { summarizeWithOpenCodeGo, type AiSummaryResult } from '../_shared/ai.ts'
import { collectArticlesFromSite } from '../_shared/rss.ts'

interface CollectBody {
  tag?: string
  keyword?: string
  count?: number
}

interface Site {
  id: number
  tag: string
  site_url: string
  rss_url: string | null
}

// デバッグメッセージ出力用関数
// @param msg 出力する文字列
function debug(msg: string) {
  // 開発時は有効、本番はここをコメントアウト
  console.log(`[DEBUG] ${msg}`)
}

// ユーザーに "others" カテゴリがなければ作成する
// @param supabase service_role クライアント
// @param userId ユーザー ID
// @return 使用する category_id
async function ensureOthersCategory(supabase: ReturnType<typeof getServiceClient>, userId: string): Promise<string> {
  const { data: existing } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', userId)
    .eq('id', 'others')
    .maybeSingle()

  if (existing) {
    return existing.id
  }

  const { data: inserted, error } = await supabase
    .from('categories')
    .insert({ id: 'others', user_id: userId, name: '未分類', icon: 'grid', sort_order: 9999 })
    .select('id')
    .single()

  if (error || !inserted) {
    debug(`others カテゴリ作成失敗: ${error?.message}`)
    // フォールバック: 既存の最初のカテゴリを使用
    const { data: firstCategory } = await supabase
      .from('categories')
      .select('id')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
      .limit(1)
      .single()
    return firstCategory?.id || 'others'
  }

  return inserted.id
}

Deno.serve(async (req) => {
  // CORS プリフライト対応
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const jwt = getJwt(req)
  if (!jwt) {
    return new Response(JSON.stringify({ error: '認証が必要です' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // JWT 検証は anon キーのユーザークライアントで行い、DB 操作は service_role クライアントで行う
  const authClient = getUserClient(req)
  const { data: userData, error: userError } = await authClient.auth.getUser()
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: '認証に失敗しました' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const userId = userData.user.id
  const supabase = getServiceClient()

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POSTメソッドのみ許可されています' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: CollectBody
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'JSONボディが不正です' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const tag = String(body.tag || '').trim()
  const keyword = String(body.keyword || '').trim()
  const count = Math.max(1, Math.min(20, Number(body.count) || 5))

  // タグ・キーワードともに未指定でも全サイト対象で収集できるようにする
  const query = tag || keyword

  // 該当する収集元サイトを取得する
  const { data: allSites, error: sitesError } = await supabase
    .from('source_sites')
    .select('id, tag, site_url, rss_url')
    .eq('user_id', userId)

  if (sitesError) {
    return new Response(JSON.stringify({ error: sitesError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // サイト絞り込みロジック
  // - タグ指定時: source_sites.tag に部分一致
  // - キーワード指定時: source_sites.tag / site_url に部分一致
  // - 未指定時: 全サイト対象
  const normalizedQuery = query.toLowerCase()
  const matchedSites = (allSites || []).filter((site: Site) => {
    if (!query) return true
    const tagMatch = (site.tag || '').toLowerCase().includes(normalizedQuery)
    const urlMatch = (site.site_url || '').toLowerCase().includes(normalizedQuery)
    return tagMatch || urlMatch
  })

  const siteDiagnostics = matchedSites.map((site) => ({
    id: site.id,
    tag: site.tag,
    site_url: site.site_url,
    rss_url: site.rss_url,
  }))
  debug(`マッチしたサイト数: ${matchedSites.length}`)

  if (matchedSites.length === 0) {
    return new Response(
      JSON.stringify({
        error: '該当するタグの収集元サイトが登録されていません。設定から追加してください。',
        diagnostics: { tag, keyword, matched_sites: 0 },
      }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }

  // AI要約設定を取得する
  const aiSettings = await getAppSettings(supabase, userId)

  // 登録先カテゴリを確保する
  const categoryId = await ensureOthersCategory(supabase, userId)
  debug(`使用カテゴリ: ${categoryId}`)

  const collected: Record<string, unknown>[] = []
  const skipped = { duplicate: 0, insertError: 0 }
  const perSiteResults: Record<string, unknown>[] = []

  for (const site of matchedSites) {
    if (collected.length >= count) break

    let articles: Awaited<ReturnType<typeof collectArticlesFromSite>> = []
    let fetchError: string | null = null
    try {
      articles = await collectArticlesFromSite(site.site_url, site.rss_url)
    } catch (err) {
      fetchError = err instanceof Error ? err.message : '不明なエラー'
      debug(`記事取得失敗: ${site.site_url} - ${fetchError}`)
    }

    // キーワード指定時は記事タイトル・本文でフィルタする
    const normalizedKeyword = keyword.toLowerCase()
    if (keyword) {
      articles = articles.filter((article) =>
        article.title.toLowerCase().includes(normalizedKeyword) ||
        article.summary.toLowerCase().includes(normalizedKeyword)
      )
    }

    let siteRegistered = 0
    for (const article of articles) {
      if (collected.length >= count) break

      // 重複チェック（通常・ゴミ箱を含めた未完全削除のクリップ）
      const { data: existing } = await supabase
        .from('clips')
        .select('id')
        .eq('user_id', userId)
        .eq('url', article.url)
        .maybeSingle()

      if (existing) {
        debug(`重複スキップ: ${article.url}`)
        skipped.duplicate++
        continue
      }

      let summary = article.summary || ''
      let eventStartDate: string | null = null
      let eventEndDate: string | null = null
      let location: string | null = null

      // AI要約が有効で API キーがあれば要約を生成する
      if (aiSettings.enabled && aiSettings.apiKey && summary) {
        try {
          const aiResult: AiSummaryResult = await summarizeWithOpenCodeGo(summary, article.title, aiSettings)
          if (aiResult.summary) summary = aiResult.summary
          eventStartDate = aiResult.eventStartDate
          eventEndDate = aiResult.eventEndDate
          location = aiResult.location
        } catch (err) {
          const message = err instanceof Error ? err.message : '不明なエラー'
          debug(`AI要約失敗: ${article.url} - ${message}`)
        }
      }

      const { data: inserted, error: insertError } = await supabase
        .from('clips')
        .insert({
          user_id: userId,
          url: article.url,
          title: article.title,
          summary,
          raw_body: '',
          category_id: categoryId,
          event_start_date: eventStartDate,
          event_end_date: eventEndDate,
          location,
          is_pinned: false,
          is_checked: false,
          comment: '',
        })
        .select()
        .single()

      if (insertError || !inserted) {
        debug(`クリップ登録失敗: ${insertError?.message}`)
        skipped.insertError++
        continue
      }

      collected.push(inserted)
      siteRegistered++
    }

    perSiteResults.push({
      site_id: site.id,
      site_url: site.site_url,
      rss_url: site.rss_url,
      fetched: articles.length,
      registered: siteRegistered,
      error: fetchError,
    })
  }

  debug(`クリップ収集完了: 登録${collected.length}件 / 重複スキップ${skipped.duplicate}件 / 登録失敗${skipped.insertError}件`)

  return new Response(
    JSON.stringify({
      ok: true,
      count: collected.length,
      clips: collected,
      diagnostics: {
        tag,
        keyword,
        requested_count: count,
        matched_sites: matchedSites.length,
        matched_site_list: siteDiagnostics,
        per_site_results: perSiteResults,
        skipped,
        category_id: categoryId,
      },
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  )
})
