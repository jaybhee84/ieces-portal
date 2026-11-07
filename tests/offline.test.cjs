const { test } = require('node:test');
const assert = require('node:assert/strict');

test('offline records are isolated by account, writes are blocked, and logout clears data', async () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const stores = new Map();
  globalThis.caches = {
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const data = stores.get(name);
      return { put: async (key, response) => data.set(key, response), match: async (key) => data.get(key)?.clone() };
    },
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  };
  const { createOfflineFetch, rememberOfflineSession, restoreOfflineSession, clearOfflineData } = await import('../src/lib/offline.mjs');
  let online = true;
  let requests = 0;
  const fetchRecords = createOfflineFetch(async () => {
    requests++;
    return new Response('[{"id":1}]', { status: 206, headers: { 'content-range': '0-0/1' } });
  }, caches, () => online);
  const url = 'https://example.com/rest/v1/students?select=*';
  rememberOfflineSession({ user: { id: 'teacher-a' } });
  await fetchRecords(url);
  online = false;
  assert.equal((await restoreOfflineSession()).user.id, 'teacher-a');
  const cached = await fetchRecords(url);
  assert.equal(cached.status, 206);
  assert.deepEqual(await cached.json(), [{ id: 1 }]);
  assert.equal(cached.headers.get('content-range'), '0-0/1');
  assert.equal((await fetchRecords(url, { headers: { Range: '10-20' } })).status, 503);
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    assert.equal((await fetchRecords(url, { method })).status, 503);
  }
  assert.equal(requests, 1);
  rememberOfflineSession({ user: { id: 'teacher-b' } });
  assert.equal((await fetchRecords(url)).status, 503);
  await clearOfflineData();
  assert.equal(restoreOfflineSession(), null);
  assert.equal(stores.size, 0);
});

test('offline access expires after seven days and malformed snapshots are rejected', async () => {
  const { restoreOfflineSession } = await import('../src/lib/offline.mjs');
  localStorage.setItem('ieces-offline-session', JSON.stringify({ user: { id: 'a' }, savedAt: Date.now() - 8 * 86400000 }));
  assert.equal(restoreOfflineSession(), null);
  localStorage.setItem('ieces-offline-session', 'broken');
  assert.equal(restoreOfflineSession(), null);
});

test('a full local store does not block online login and failed caches return an offline error', async () => {
  const { rememberOfflineSession, createOfflineFetch } = await import('../src/lib/offline.mjs');
  const previous = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('Quota exceeded'); };
  assert.doesNotThrow(() => rememberOfflineSession({ user: { id: 'teacher-a' } }));
  localStorage.setItem = previous;
  const offline = createOfflineFetch(() => { throw new Error('Network must not run'); }, {
    open: async () => ({ match: async () => { throw new Error('Storage unavailable'); } }),
  }, () => false);
  assert.equal((await offline('https://example.com/rest/v1/students')).status, 503);
});
