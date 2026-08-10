const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

let mainWindow;

// ── Auto-updater ──────────────────────────────────────────────────────────────
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function setupAutoUpdater() {
  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('updater:status', { status: 'checking' });
  });
  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('updater:status', {
      status: 'available',
      version: info.version,
      releaseDate: info.releaseDate,
    });
  });
  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('updater:status', { status: 'up-to-date' });
  });
  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('updater:status', {
      status: 'error',
      message: err.message,
    });
  });
  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('updater:progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('updater:status', {
      status: 'downloaded',
      version: info.version,
    });
  });
}

// ── Full menu (replaces Electron default entirely) ────────────────────────────
function buildMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    // macOS needs the app menu as the first item
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),

    // File
    {
      label: 'File',
      submenu: [
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },

    // Edit
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },

    // View
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },

    // Window
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'close' },
      ],
    },

    // Help — Check for Updates is the FIRST item
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates',
          click: () => {
            mainWindow?.webContents.send('menu:checkForUpdates');
          },
        },
        { type: 'separator' },
        {
          label: 'Learn More',
          click: () => shell.openExternal('https://project-rising-xi.vercel.app'),
        },
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://github.com/jaybhee84/ieces-report/wiki'),
        },
        {
          label: 'Community Discussions',
          click: () => shell.openExternal('https://github.com/jaybhee84/ieces-report/discussions'),
        },
        {
          label: 'Search Issues',
          click: () => shell.openExternal('https://github.com/jaybhee84/ieces-report/issues'),
        },
      ],
    },
  ];

  // This REPLACES the default menu entirely — no merging
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── IPC handlers ──────────────────────────────────────────────────────────────
ipcMain.handle('app:getVersion', () => app.getVersion());

ipcMain.handle('updater:check', async () => {
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});

ipcMain.handle('updater:download', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});

ipcMain.handle('updater:install', () => {
  autoUpdater.quitAndInstall();
});

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Isabela East Central ES - Portal',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  buildMenu();       // set menu BEFORE creating window
  createWindow();
  setupAutoUpdater();

  // Silent background check 3s after launch (production only)
  if (process.env.NODE_ENV !== 'development') {
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 3000);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
