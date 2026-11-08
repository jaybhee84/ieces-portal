const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const read = (path) => readFileSync(path, 'utf8');

test('camera selection releases the previous camera and requests the chosen device', async () => {
  const source = read('src/component/EnrollmentForm.jsx');
  const body = source.split('const startCamera = async (deviceId = activeCameraId) => {')[1].split('\n  const stopCamera =')[0];
  const cameras = [
    { kind: 'videoinput', deviceId: 'front', label: 'Front camera' },
    { kind: 'videoinput', deviceId: 'back', label: 'Back camera' },
  ];
  const calls = [];
  let selected;
  const stream = {
    getVideoTracks: () => [{ getSettings: () => ({ deviceId: 'back' }) }],
    getTracks: () => [{ stop: () => calls.push('release') }],
  };
  const navigator = { mediaDevices: {
    enumerateDevices: async () => cameras,
    getUserMedia: async (constraints) => { calls.push(constraints); return stream; },
  } };
  const noop = () => {};
  const open = new Function(
    'navigator', 'stopCamera', 'setIsCameraStarting', 'setAvailableCameras',
    'cameraPreferenceScore', 'videoRef', 'setActiveCameraId', 'setActiveCameraLabel',
    'setIsCameraActive', 'alert',
    `return async (deviceId) => {${body}`,
  );
  const start = open(navigator, () => calls.push('stop'), noop, noop, () => 0,
    { current: { play: async () => {} } }, (id) => { selected = id; }, noop, noop,
    (message) => assert.fail(message));
  await start('back');
  assert.equal(calls[0], 'stop');
  assert.deepEqual(calls[1].video.deviceId, { exact: 'back' });
  assert.equal(calls[1].audio, false);
  assert.equal(selected, 'back');

  calls.length = 0;
  const detached = open(navigator, noop, noop, noop, () => 0, { current: null }, noop, noop, noop,
    (message) => assert.fail(message));
  await detached('back');
  assert.equal(calls.at(-1), 'release');
});

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
