/**
 * Service Worker - 学習管理ポモドーロ PWA
 * オフライン対応・キャッシュ戦略
 */

const CACHE_NAME = 'pomodoro-v4';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './auth.js',
    './sync.js',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

// インストール時にキャッシュ
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// アクティベート時に古いキャッシュを削除
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// フェッチ時のキャッシュ戦略（Network First, Cache Fallback）
self.addEventListener('fetch', (event) => {
    // Firebase/外部APIはキャッシュしない
    if (event.request.url.includes('firebaseio.com') ||
        event.request.url.includes('googleapis.com') ||
        event.request.url.includes('firebase')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // 成功したらキャッシュを更新
                if (response.ok) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // オフライン時はキャッシュから返す
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // index.htmlにフォールバック
                    if (event.request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                    return new Response('Offline', { status: 503 });
                });
            })
    );
});

// バックグラウンド同期
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-sessions') {
        console.log('[SW] Background sync triggered');
        event.waitUntil(syncOfflineData());
    }
});

// オフラインデータの同期（クライアントに通知）
async function syncOfflineData() {
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
        client.postMessage({ type: 'SYNC_REQUIRED' });
    });
}

// プッシュ通知（将来の拡張用）
self.addEventListener('push', (event) => {
    const data = event.data?.json() || { title: 'ポモドーロ', body: 'お知らせ' };

    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: '📚',
            badge: '📚',
            vibrate: [200, 100, 200]
        })
    );
});
