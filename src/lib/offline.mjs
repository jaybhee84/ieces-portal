const SESSION_KEY = 'ieces-offline-session';
const CACHE_PREFIX = 'ieces-records-';
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
let userId = null;

export function rememberOfflineSession(session) {
  userId = session?.user?.id || null;
  try {
    if (userId) localStorage.setItem(SESSION_KEY, JSON.stringify({ user: session.user, savedAt: Date.now() }));
  } catch { /* Offline storage must not prevent a valid online login. */ }
}

export function restoreOfflineSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!saved?.user?.id || !Number.isFinite(saved.savedAt) || saved.savedAt > Date.now() || Date.now() - saved.savedAt > MAX_AGE) {
      userId = null;
      return null;
    }
    userId = saved.user.id;
    return { user: saved.user };
  } catch {
    userId = null;
    return null;
  }
}

export async function clearOfflineData() {
  userId = null;
  localStorage.removeItem(SESSION_KEY);
  if (globalThis.caches) {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX)).map((name) => caches.delete(name)));
  }
}

export function createOfflineFetch(networkFetch, cacheStorage = globalThis.caches, isOnline = () => navigator.onLine) {
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const read = request.method === 'GET' && url.pathname.startsWith('/rest/v1/') && !url.pathname.includes('/rpc/');
    // Never put access tokens in cache keys or store another account's responses.
    const account = userId;
    const key = new URL(url);
    key.searchParams.set('__offline_accept', request.headers.get('accept') || '');
    key.searchParams.set('__offline_range', request.headers.get('range') || '');
    key.searchParams.set('__offline_prefer', request.headers.get('prefer') || '');
    let cache;
    if (account && read && cacheStorage) {
      try { cache = await cacheStorage.open(CACHE_PREFIX + account); } catch { /* Storage may be unavailable. */ }
    }
    if (!isOnline()) {
      if (cache) {
        let saved;
        try { saved = await cache.match(key.href); } catch { /* Report unavailable offline data below. */ }
        if (saved) return new Response(await saved.arrayBuffer(), {
          status: Number(saved.headers.get('x-offline-status')) || saved.status,
          headers: saved.headers,
        });
      }
      return new Response(JSON.stringify({ message: read ? 'This record is not available offline. Load it while online first.' : 'Internet is required to sign in or save changes.' }), {
        status: 503, headers: { 'Content-Type': 'application/json' },
      });
    }
    const response = await networkFetch(input, init);
    if (cache && response.ok && account === userId) {
      try {
        const headers = new Headers(response.headers);
        headers.set('x-offline-status', String(response.status));
        // CacheStorage rejects 206 responses, which PostgREST uses for ranges.
        await cache.put(key.href, new Response(await response.clone().arrayBuffer(), { status: 200, headers }));
      } catch { /* A full cache must not break online access. */ }
    }
    return response;
  };
}
