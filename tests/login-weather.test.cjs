const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const weather = import(`data:text/javascript;base64,${Buffer.from(readFileSync('src/lib/loginWeather.js', 'utf8')).toString('base64')}`);

test('heat index handles warm, cool and humidity adjustment cases', async () => {
  const { heatIndexCelsius } = await weather;
  assert.equal(heatIndexCelsius(32.2222222222, 70), 41); // 90 F, approximately 106 F index.
  assert.equal(heatIndexCelsius(20, 50), 20);
  assert.equal(heatIndexCelsius(35, 10), 32);
  assert.equal(heatIndexCelsius(30, 90), 41);
  for (const humidity of [null, undefined, NaN, -1, 101]) {
    assert.equal(heatIndexCelsius(32, humidity), null);
  }
  assert.equal(heatIndexCelsius(null, 70), null);
  assert.equal(heatIndexCelsius(Infinity, 70), null);
});

test('current weather requests humidity and includes a heat index', async (t) => {
  const { fetchLoginWeather } = await weather;
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.match(new URL(url).searchParams.get('current'), /relative_humidity_2m/);
    assert.equal(options.signal, controller.signal);
    return { ok: true, json: async () => ({
      current: { weather_code: 0, temperature_2m: 32.2222222222, relative_humidity_2m: 70 },
      hourly: { time: [], weather_code: [], temperature_2m: [] },
    }) };
  });
  const result = await fetchLoginWeather(controller.signal);
  assert.equal(result.current.heatIndex, 41);
  assert.equal(result.current.temperature, 32);
});
