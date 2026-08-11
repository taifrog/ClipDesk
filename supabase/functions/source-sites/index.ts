/// <reference lib="deno.ns" />
// 収集元サイトの一覧・追加・削除を行う Edge Function

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { getServiceClient, getUserClient, getJwt } from '../_shared/supabase.ts';
import { detectRssUrl } from '../_shared/rss.ts';

interface SourceSiteBody {
  tag?: string;
  site_url?: string;
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const jwt = getJwt(req);
  if (!jwt) {
    return new Response(JSON.stringify({ error: '認証が必要です' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // JWT 検証は anon キーのユーザークライアントで行い、DB 操作は service_role クライアントで行う
  const authClient = getUserClient(req);
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: '認証に失敗しました' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userId = userData.user.id;
  const supabase = getServiceClient();

  const url = new URL(req.url);

  // GET /source-sites 一覧
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('source_sites')
      .select('*')
      .eq('user_id', userId)
      .order('tag', { ascending: true })
      .order('id', { ascending: true });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ sites: data || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // POST /source-sites 追加（RSS自動検出）
  if (req.method === 'POST') {
    let body: SourceSiteBody;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'JSONボディが不正です' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const tag = String(body.tag || '').trim();
    const siteUrl = String(body.site_url || '').trim();
    if (!tag || !siteUrl) {
      return new Response(JSON.stringify({ error: 'tag と site_url は必須です' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 同じタグあたり最大5件まで
    const { count, error: countError } = await supabase
      .from('source_sites')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('tag', tag);
    if (countError) {
      return new Response(JSON.stringify({ error: countError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if ((count || 0) >= 5) {
      return new Response(JSON.stringify({ error: '同じタグには最大5件までしか登録できません', code: 'TAG_LIMIT_EXCEEDED' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let rssUrl: string | null = null;
    let rssDetectionError: string | null = null;
    try {
      rssUrl = await detectRssUrl(siteUrl);
    } catch (err) {
      // RSS検出失敗は無視してサイト登録を続行するが、理由はレスポンスに含める
      rssDetectionError = err instanceof Error ? err.message : 'RSS検出に失敗しました';
    }

    const { data, error } = await supabase
      .from('source_sites')
      .insert({ user_id: userId, tag, site_url: siteUrl, rss_url: rssUrl })
      .select()
      .single();
    if (error) {
      const isDuplicate = error.code === '23505';
      return new Response(JSON.stringify({
        error: isDuplicate ? '同じURLのサイトは既に登録されています' : error.message,
        code: isDuplicate ? 'DUPLICATE_SITE_URL' : undefined,
      }), {
        status: isDuplicate ? 409 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      ok: true,
      site: data,
      rss_detected: !!rssUrl,
      rss_detection_error: rssDetectionError,
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // DELETE /source-sites/:id 削除
  const idMatch = url.pathname.match(/\/source-sites\/(\d+)$/);
  if (idMatch && req.method === 'DELETE') {
    const siteId = Number(idMatch[1]);
    const { error } = await supabase.from('source_sites').delete().eq('id', siteId).eq('user_id', userId);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true, id: siteId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Not Found' }), {
    status: 404,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
