// クリップの一覧・ゴミ箱・更新・削除を行う Edge Function
// フロントエンドからの Bearer 認証を使用する。

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { getServiceClient, getUserClient, getJwt } from '../_shared/supabase.ts';

interface ClipUpdateBody {
  category_id?: string;
  is_pinned?: boolean;
  is_checked?: boolean;
  comment?: string;
}

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
  const pathSegments = url.pathname.split('/').filter(Boolean);
  const resource = pathSegments[pathSegments.length - 1];

  // GET /clips 一覧
  if (req.method === 'GET' && resource === 'clips') {
    const showTrash = url.searchParams.get('trash') === 'true';
    let query = supabase
      .from('clips')
      .select('*')
      .eq('user_id', userId)
      .order('is_pinned', { ascending: false })
      .order('received_at', { ascending: false });
    if (showTrash) {
      query = query.not('deleted_at', 'is', null);
    } else {
      query = query.is('deleted_at', null);
    }
    const { data, error } = await query;
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ clips: data || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // PATCH /clips/:id/trash ゴミ箱へ移動
  // PATCH /clips/:id/restore 復元
  // PATCH /clips/:id 更新
  // DELETE /clips/:id 削除
  const idMatch = url.pathname.match(/\/clips\/(\d+)(?:\/(trash|restore))?$/);
  if (idMatch) {
    const clipId = Number(idMatch[1]);
    const action = idMatch[2];

    if (req.method === 'PATCH') {
      if (action === 'trash') {
        const { error } = await supabase
          .from('clips')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', clipId)
          .eq('user_id', userId)
          .is('deleted_at', null);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ ok: true, id: clipId }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (action === 'restore') {
        const { error } = await supabase
          .from('clips')
          .update({ deleted_at: null })
          .eq('id', clipId)
          .eq('user_id', userId)
          .not('deleted_at', 'is', null);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ ok: true, id: clipId }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let updates: ClipUpdateBody;
      try {
        updates = await req.json();
      } catch {
        return new Response(JSON.stringify({ error: 'JSONボディが不正です' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const allowed: Record<string, unknown> = {};
      if ('category_id' in updates) allowed.category_id = updates.category_id;
      if ('is_pinned' in updates) allowed.is_pinned = updates.is_pinned;
      if ('comment' in updates) allowed.comment = updates.comment;
      if ('is_checked' in updates) {
        allowed.is_checked = updates.is_checked;
        allowed.checked_at = updates.is_checked ? new Date().toISOString() : null;
      }

      if (Object.keys(allowed).length === 0) {
        return new Response(JSON.stringify({ error: '更新する項目がありません' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabase
        .from('clips')
        .update(allowed)
        .eq('id', clipId)
        .eq('user_id', userId)
        .select()
        .single();
      if (error || !data) {
        return new Response(JSON.stringify({ error: error?.message || 'クリップが見つかりません' }), {
          status: error?.code === 'PGRST116' ? 404 : 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, clip: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'DELETE') {
      const { error } = await supabase.from('clips').delete().eq('id', clipId).eq('user_id', userId);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, id: clipId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Not Found' }), {
    status: 404,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
