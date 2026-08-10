// Chrome 拡張機能等で使用する API キーの管理を行う Edge Function

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { getServiceClient, getJwt } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const jwt = getJwt(req);
  if (!jwt) {
    return new Response(JSON.stringify({ error: '認証が必要です' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = getServiceClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: '認証に失敗しました' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userId = userData.user.id;

  // GET /user-api-keys 一覧取得
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('user_api_keys')
      .select('id, label, created_at, last_used_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ keys: data || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // POST /user-api-keys 新規発行
  if (req.method === 'POST') {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'JSONボディが不正です' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const label = typeof body.label === 'string' ? body.label.trim() : '';
    // 平文の API キーを生成する（prefix は判別用）
    const rawKey = `cdk_${crypto.randomUUID().replace(/-/g, '')}`;

    // SHA-256 でハッシュ化する（保存用）
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(rawKey));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const keyHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    const { data, error } = await supabase
      .from('user_api_keys')
      .insert({ user_id: userId, key_hash: keyHash, label })
      .select('id, label, created_at')
      .single();

    if (error || !data) {
      return new Response(JSON.stringify({ error: error?.message || 'API キーの保存に失敗しました' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 平文は発行時のみ返す（以降は復元できない）
    return new Response(JSON.stringify({ ok: true, key: { ...data, rawKey } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // DELETE /user-api-keys/:id 削除
  if (req.method === 'DELETE') {
    const url = new URL(req.url);
    const segments = url.pathname.split('/').filter(Boolean);
    const id = segments.length >= 2 ? Number(segments[segments.length - 1]) : NaN;
    if (Number.isNaN(id)) {
      return new Response(JSON.stringify({ error: 'id が不正です' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error } = await supabase
      .from('user_api_keys')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
    status: 405,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
