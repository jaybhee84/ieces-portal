const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),

  // Auto-updater actions
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate:  () => ipcRenderer.invoke('updater:download'),
  installUpdate:   () => ipcRenderer.invoke('updater:install'),

  // Updater push events (main → renderer)
  onUpdaterStatus:   (cb) => ipcRenderer.on('updater:status',   (_e, d) => cb(d)),
  onUpdaterProgress: (cb) => ipcRenderer.on('updater:progress', (_e, d) => cb(d)),

  // Native menu "Check for Updates" click → open modal in renderer
  onMenuCheckForUpdates: (cb) => ipcRenderer.on('menu:checkForUpdates', () => cb()),

  // Cleanup
  removeUpdaterListeners: () => {
    ipcRenderer.removeAllListeners('updater:status');
    ipcRenderer.removeAllListeners('updater:progress');
    ipcRenderer.removeAllListeners('menu:checkForUpdates');
  },
});