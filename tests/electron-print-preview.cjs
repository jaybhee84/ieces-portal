// Run with Vite running: electron tests/electron-print-preview.cjs
// Uses synthetic documents and a stub print method: never submits a printer job.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { setupPrinting } = require('../electron/printing');
const testProfile = path.resolve('out/print-preview-check/profile');
fs.mkdirSync(testProfile, { recursive: true });
app.setPath('userData', testProfile);
app.disableHardwareAcceleration();
let main;
const cleanup = setupPrinting(() => main);
setTimeout(() => { console.error('Electron integration test exceeded 45 seconds.'); cleanup(); app.exit(1); }, 45000).unref();
const run = code => main.webContents.executeJavaScript(code);
async function until(code, label) {
  for (let i = 0; i < 120; i++) {
    if (await run(code)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${label}\n${await run('document.body.innerText')}`);
}
app.whenReady().then(async () => {
  try {
    main = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { preload: path.resolve('electron/preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, offscreen: true } });
    main.webContents.on('console-message', (_event, level, message) => { if (level >= 2) console.log('renderer:', message); });
    await main.loadURL('http://127.0.0.1:5173/tests/print-preview.html');
    await until("!!document.getElementById('open-preview')", 'fixture mount');
    console.log('Fixture mounted');
    await run("window.alert = message => console.error('PREVIEW ALERT:', message); true");
    // Do not depend on installed hardware to exercise print button behavior.
    main.webContents.getPrintersAsync = async () => [{ name: 'Test printer', displayName: 'Test printer', isDefault: true }];
    await run("document.getElementById('open-preview').click()");
    console.log('Preview requested');
    await until("document.body.innerText.includes('Page 1 of 2') && document.querySelector('canvas')?.width > 0", 'two page PDF render');
    await until("(() => { const c = document.querySelector('canvas'); return c.height < 800 && Math.abs(c.width / c.height - 8.5 / 13) < .01; })()", 'automatic fit page');
    await run("[...document.querySelectorAll('button')].find(b => b.textContent.includes('Next')).click()");
    await until("document.body.innerText.includes('Page 2 of 2')", 'next page');
    await run("[...document.querySelectorAll('label')].find(l => l.textContent.includes('Current page')).querySelector('input').click()");
    assert.ok((await run('document.body.innerText')).includes('Page 2 of 2'));
    await run("[...document.querySelectorAll('button')].find(b => b.textContent === 'Fit page').click()");
    await new Promise(resolve => setTimeout(resolve, 350));
    const output = path.resolve('out/print-preview-check');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'dialog.png'), (await main.webContents.capturePage()).toPNG());
    const source = BrowserWindow.getAllWindows().find(window => window !== main);
    assert.ok(source, 'ID document uses isolated print window');
    source.webContents.getPrintersAsync = main.webContents.getPrintersAsync;
    let job;
    source.webContents.print = (options, callback) => { job = options; callback(true); };
    await run("[...document.querySelectorAll('button')].find(b => b.textContent === 'Print').click()");
    await until("!document.querySelector('[role=dialog]')", 'dialog close after stub print');
    assert.deepEqual(job.pageRanges, [{ from: 1, to: 1 }]);
    assert.deepEqual(job.pageSize, { width: 215900, height: 330200 });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(source.isDestroyed(), 'isolated document cleaned up');
    // Page-by-page printing waits for the user before each later page.
    await run("document.getElementById('open-stepped').click()");
    await until("document.body.innerText.includes('Page 1 of 2') && document.querySelector('canvas')?.width > 0", 'stepped preview');
    const stepped = BrowserWindow.getAllWindows().find(window => window !== main);
    stepped.webContents.getPrintersAsync = main.webContents.getPrintersAsync;
    const steppedJobs = [];
    stepped.webContents.print = (options, callback) => { steppedJobs.push(options.pageRanges); callback(true); };
    await run("[...document.querySelectorAll('button')].find(b => b.textContent === 'Print').click()");
    await until("document.body.innerText.includes('Flip the sheet for page 2.')", 'next-page prompt');
    assert.deepEqual(steppedJobs, [[{ from: 0, to: 0 }]], 'only the first page printed before confirming');
    await run("[...document.querySelectorAll('button')].find(b => b.textContent === 'Continue').click()");
    await until("!document.querySelector('[role=dialog]')", 'dialog close after stepped print');
    assert.deepEqual(steppedJobs, [[{ from: 0, to: 0 }], [{ from: 1, to: 1 }]]);
    await run("document.getElementById('open-report').click()");
    await until("document.body.innerText.includes('Page 1 of 1') && document.querySelector('canvas')?.width > 0", 'live Legal report');
    await until("(() => { const c = document.querySelector('canvas'); return Math.abs(c.width / c.height - 8.5 / 14) < .01; })()", 'Legal preview proportions');
    await run("document.getElementById('pp-orientation').value = 'landscape'; document.getElementById('pp-orientation').dispatchEvent(new Event('change', { bubbles: true }))");
    await until("(() => { const c = document.querySelector('canvas'); return Math.abs(c.width / c.height - 14 / 8.5) < .01; })()", 'landscape re-render');
    await run("document.getElementById('pp-color').value = 'grayscale'; document.getElementById('pp-color').dispatchEvent(new Event('change', { bubbles: true }))");
    await until("!document.body.innerText.includes('Generating preview') && !document.querySelector('canvas').style.display.includes('none')", 'grayscale preview');
    const report = await run("window.electronAPI.printRenderPreview({})");
    assert.ok(report.success, report.error);
    fs.writeFileSync(path.join(output, 'legal-report.pdf'), Buffer.from(report.base64, 'base64'));
    await run("document.querySelector('[aria-label=\"Close print preview\"]').click()");
    console.log('PASS: Folio and Legal PDFs, PDF.js canvas, navigation, current-page print, settings and cleanup. No printer job sent.');
    cleanup(); main.destroy(); app.exit(0);
  } catch (error) {
    console.error(error);
    cleanup(); app.exit(1);
  }
});
