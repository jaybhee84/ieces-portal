const { test } = require('node:test');
const assert = require('node:assert/strict');

test('last login remembers only the identifier and tolerates unavailable storage', async () => {
  const { loadLastLogin, saveLastLogin } = await import('../src/lib/lastLogin.mjs');
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const saved = new Map();
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => saved.set(key, value),
    } });
    assert.equal(loadLastLogin(), '');
    saveLastLogin('teacher@example.com');
    assert.equal(loadLastLogin(), 'teacher@example.com');
    assert.deepEqual([...saved], [['ieces-portal-last-login', 'teacher@example.com']]);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage blocked'); } });
    assert.equal(loadLastLogin(), '');
    assert.doesNotThrow(() => saveLastLogin('teacher'));
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});
