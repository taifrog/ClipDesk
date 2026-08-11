// クリップ収集用 Edge Function
// 登録済みの収集元サイトから RSS/スクレイピングで記事を収集し、クリップとして登録する。

import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getServiceClient, getUserClient, getJwt } from '../_shared/supabase.ts'
import { getAppSettings } from '../_shared/settings.ts'
import { summarizeWithOpenCodeGo } from '../_shared/ai.ts'
import { collectArticlesFromSite } from '../_shared/rss.ts'

interface CollectBody {
  tag?: string
  keyword?: string
  count?: number
}

// デバッグメッセージ出力用関数
// @param msg 出力する文字列
function debug(msg: string) {
  // 開発時は有効、本番はここをコメントアウト
  console.log(`[DEBUG] ${msg}`)
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

  if (!tag && !keyword) {
    return new Response(JSON.stringify({ error: 'タグまたはキーワードを指定してください' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

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

  const matchedSites = (allSites || []).filter((site) =>
    (site.tag || '').toLowerCase().includes(query.toLowerCase()),
  )

  if (matchedSites.length === 0) {
    return new Response(
      JSON.stringify({ error: '該当するタグの収集元サイトが登録されていません。設定から追加してください。' }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }

  // AI要約設定を取得する
  const aiSettings = await getAppSettings(supabase, userId)

  const collected: Record<string, unknown>[] = []

  for (const site of matchedSites) {
    if (collected.length >= count) break

    const articles = await collectArticlesFromSite(site.site_url, site.rss_url)

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
        continue
      }

      let summary = article.summary || ''

      // AI要約が有効で API キーがあれば要約を生成する
      if (aiSettings.enabled && aiSettings.apiKey && summary) {
        try {
          const aiSummary = await summarizeWithOpenCodeGo(summary, article.title, aiSettings)
          if (aiSummary) summary = aiSummary
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
          category_id: 'others',
          is_pinned: false,
          is_checked: false,
          comment: '',
        })
        .select()
        .single()

      if (insertError || !inserted) {
        debug(`クリップ登録失敗: ${insertError?.message}`)
        continue
      }

      collected.push(inserted)
    }
  }

  debug(`クリップ収集完了: ${collected.length}件`)

  return new Response(
    JSON.stringify({ ok: true, count: collected.length, clips: collected }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  )
})
