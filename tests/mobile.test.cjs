const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const read = (path) => readFileSync(path, 'utf8');

test('mobile camera permissions and adaptive launcher artwork are bundled', () => {
  assert.match(read('android/app/src/main/AndroidManifest.xml'), /uses-permission android:name="android.permission.CAMERA"/);
  assert.match(read('ios/App/App/Info.plist'), /NSCameraUsageDescription/);
  for (const name of ['ic_launcher', 'ic_launcher_round']) {
    const xml = read(`android/app/src/main/res/mipmap-anydpi-v26/${name}.xml`);
    assert.match(xml, /@mipmap\/ic_launcher_foreground/);
    assert.doesNotMatch(xml, /@mipmap\/ic_launcher"/);
  }
  for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    const dir = `android/app/src/main/res/mipmap-${density}`;
    assert.ok(existsSync(`${dir}/ic_launcher_foreground.png`));
    assert.deepEqual(readFileSync(`${dir}/ic_launcher_foreground.png`), readFileSync(`${dir}/ic_launcher.png`));
  }
});
