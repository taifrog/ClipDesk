// ClipDesk PWA 用 Service Worker
// Web Share Target からの POST リクエストを受け取り、React アプリ内の /share ページへ渡す

const CACHE_NAME = 'clipdesk-v1';

// インストール時に必要な静的アセットをキャッシュする
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/ClipDesk/',
        '/ClipDesk/index.html',
      ]);
    })
  );
  // インストール後すぐにアクティブ化する
  self.skipWaiting();
});

// アクティブ化時に古いキャッシュを削除する
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  // 既存のクライアントを即座に制御下に置く
  self.clients.claim();
});

// Web Share Target からの POST リクエストを処理する
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Web Share Target のエンドポイント（/ClipDesk/share）への POST のみ処理する
  if (
    event.request.method === 'POST' &&
    url.pathname === '/ClipDesk/share'
  ) {
    event.respondWith(
      (async () => {
        try {
          // フォームデータを取得する
          const formData = await event.request.formData();
          const sharedData = {
            title: formData.get('title') || '',
            text: formData.get('text') || '',
            url: formData.get('url') || '',
          };

          // 全クライアントに共有データを送信する
          const allClients = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true,
          });
          for (const client of allClients) {
            client.postMessage({
              type: 'WEB_SHARE_TARGET',
              payload: sharedData,
            });
          }

          // /ClipDesk/share へリダイレクトする（クエリ文字列にエンコードして渡す）
          const redirectUrl = new URL('/ClipDesk/share', self.location.origin);
          redirectUrl.searchParams.set('title', String(sharedData.title));
          redirectUrl.searchParams.set('text', String(sharedData.text));
          redirectUrl.searchParams.set('url', String(sharedData.url));
          return Response.redirect(redirectUrl.toString(), 303);
        } catch (err) {
          console.error('[SW] Web Share Target 処理失敗:', err);
          // エラー時はトップページへフォールバック
          return Response.redirect('/ClipDesk/', 303);
        }
      })()
    );
    return;
  }

  // その他のリクエストはネットワーク優先で処理する
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
