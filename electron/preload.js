const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),

  // Auto-updater actions
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate:  () => ipcRenderer.invoke('updater:download'),
  installUpdate:   () => ipcRenderer.invoke('updater:install'),

  // Updater push events (main → renderer)
  onUpdaterStatus: (cb) => {
    const listener = (_event, data) => cb(data);
    ipcRenderer.on('updater:status', listener);
    return () => ipcRenderer.removeListener('updater:status', listener);
  },
  onUpdaterProgress: (cb) => {
    const listener = (_event, data) => cb(data);
    ipcRenderer.on('updater:progress', listener);
    return () => ipcRenderer.removeListener('updater:progress', listener);
  },

  // Native menu "Check for Updates" click → open modal in renderer
  onMenuCheckForUpdates: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('menu:checkForUpdates', listener);
    return () => ipcRenderer.removeListener('menu:checkForUpdates', listener);
  },
});
