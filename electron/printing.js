// Shared SwiSS-style preview flow, adapted for Legal reports and Folio IDs.
const { BrowserWindow, ipcMain } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildSettings, pageRanges } = require('./print-settings');

function setupPrinting(getMainWindow) {
  let sourceWindow = null;
  let documentSetup = null;
  let tempFile = null;
  let queue = Promise.resolve();
  const enqueue = action => {
    const pending = queue.then(action).catch(error => ({ success: false, error: error.message }));
    queue = pending.then(() => {});
    return pending;
  };
  const cleanup = () => {
    if (sourceWindow && !sourceWindow.isDestroyed()) sourceWindow.destroy();
    sourceWindow = null;
    documentSetup = null;
    if (tempFile) fs.rm(tempFile, { force: true }, () => {});
    tempFile = null;
  };
  function handle(channel, action) {
    ipcMain.handle(channel, (event, input) => {
      const main = getMainWindow();
      if (!main || event.sender !== main.webContents || event.senderFrame !== main.webContents.mainFrame) {
        return { success: false, error: 'Printing is only available from the portal.' };
      }
      return enqueue(() => action(input || {}, main));
    });
  }

  handle('print:prepare', async (input, main) => {
    cleanup();
    // Validate all document defaults before opening a renderer.
    buildSettings({}, input);
    documentSetup = { paper: input.paper, margin: input.margin };
    if (input.html != null) {
      if (typeof input.html !== 'string' || input.html.length > 40_000_000) throw new Error('The ID document is too large.');
      sourceWindow = new BrowserWindow({ show: false, webPreferences: {
        sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false,
      } });
      sourceWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      sourceWindow.webContents.on('will-navigate', event => event.preventDefault());
      try {
        // Load from a temp file: embedded ID images easily exceed Chromium's
        // 2 MB URL limit, which makes data: URLs fail with ERR_INVALID_URL.
        tempFile = path.join(os.tmpdir(), `ieces-print-${crypto.randomUUID()}.html`);
        await fs.promises.writeFile(tempFile, input.html, 'utf8');
        await sourceWindow.loadFile(tempFile);
      } catch (error) { cleanup(); throw error; }
    }
    // loadURL waits for the isolated document's images and styles. Its scripts
    // stay disabled; only the live portal needs an explicit readiness check.
    if (!sourceWindow) await main.webContents.executeJavaScript(`Promise.all([document.fonts.ready, ...Array.from(document.images, img => img.decode().catch(() => {}))]).then(() => true)`);
    return { success: true };
  });

  handle('print:get-printers', async (_input, main) => ({
    success: true,
    printers: (await main.webContents.getPrintersAsync()).map(printer => ({
      name: printer.name, displayName: printer.displayName || printer.name, isDefault: printer.isDefault,
    })),
  }));

  async function withPrintStyles(input, main, action) {
    if (!documentSetup) throw new Error('Reopen Print Preview to prepare the document.');
    const contents = (sourceWindow || main).webContents;
    const settings = buildSettings(input, documentSetup);
    // Apply identical page rules during PDF preview and physical printing.
    const key = await contents.insertCSS(settings.css);
    try { return await action(contents, settings); }
    finally { if (!contents.isDestroyed()) await contents.removeInsertedCSS(key); }
  }

  handle('print:render-preview', (input, main) => withPrintStyles(input, main, async (contents, settings) => {
    // Always preview the complete document: page selections refer to these page numbers.
    const buffer = await contents.printToPDF(settings.pdf);
    return { success: true, base64: buffer.toString('base64') };
  }));

  handle('print:execute', (input, main) => withPrintStyles(input, main, async (contents, settings) => {
    const printers = await contents.getPrintersAsync();
    if (!printers.some(printer => printer.name === input.printerName)) throw new Error('Choose an available printer.');
    const ranges = pageRanges(input);
    const result = await new Promise(resolve => contents.print({
      ...settings.print, deviceName: input.printerName, silent: true,
      ...(ranges ? { pageRanges: ranges } : {}),
    }, (success, error) => resolve({ success, error })));
    return result.success ? result : { success: false, error: result.error || 'Printing was canceled.' };
  }));
  handle('print:cleanup-preview', () => { cleanup(); return { success: true }; });
  return cleanup;
}

module.exports = { setupPrinting };
