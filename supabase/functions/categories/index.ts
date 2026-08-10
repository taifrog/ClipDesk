// カテゴリの一覧・追加・更新・削除を行う Edge Function

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { getServiceClient, getJwt } from '../_shared/supabase.ts';

interface CategoryBody {
  id?: string;
  name?: string;
  icon?: string;
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

  const supabase = getServiceClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: '認証に失敗しました' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userId = userData.user.id;

  const url = new URL(req.url);

  // GET /categories 一覧
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ categories: data || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // POST /categories 追加
  if (req.method === 'POST') {
    let body: CategoryBody;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'JSONボディが不正です' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { id, name, icon } = body;
    if (!id || !name) {
      return new Response(JSON.stringify({ error: 'id と name は必須です' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data, error } = await supabase
      .from('categories')
      .insert({ user_id: userId, id, name, icon: icon || 'grid', sort_order: 10 })
      .select()
      .single();
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.code === '23505' ? 409 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true, category: data }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // PATCH /categories/:id 更新
  // DELETE /categories/:id 削除
  const idMatch = url.pathname.match(/\/categories\/([^/]+)$/);
  if (idMatch) {
    const categoryId = idMatch[1];

    if (req.method === 'PATCH') {
      let body: Partial<CategoryBody>;
      try {
        body = await req.json();
      } catch {
        return new Response(JSON.stringify({ error: 'JSONボディが不正です' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const allowed: Record<string, unknown> = {};
      if ('name' in body) allowed.name = body.name;
      if ('icon' in body) allowed.icon = body.icon;
      if (Object.keys(allowed).length === 0) {
        return new Response(JSON.stringify({ error: '更新する項目がありません' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data, error } = await supabase
        .from('categories')
        .update(allowed)
        .eq('id', categoryId)
        .eq('user_id', userId)
        .select()
        .single();
      if (error || !data) {
        return new Response(JSON.stringify({ error: error?.message || 'カテゴリが見つかりません' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, category: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'DELETE') {
      if (categoryId === 'all' || categoryId === 'others') {
        return new Response(JSON.stringify({ error: 'このカテゴリーは削除できません' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // 紐づくクリップを others に移動してから削除
      await supabase.from('clips').update({ category_id: 'others' }).eq('category_id', categoryId).eq('user_id', userId);
      const { error } = await supabase.from('categories').delete().eq('id', categoryId).eq('user_id', userId);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, id: categoryId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response(JSON.stringify({ error: 'Not Found' }), {
    status: 404,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
