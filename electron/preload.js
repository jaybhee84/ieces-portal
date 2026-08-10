const { contextBridge, ipcRenderer } = require('electron');

// Expose secure, limited APIs to the React renderer window
contextBridge.exposeInMainWorld('electronAPI', {
  // Example API methods
  appVersion: process.env.npm_package_version,
  send: (channel, data) => ipcRenderer.send(channel, data),
  on: (channel, func) => ipcRenderer.on(channel, (event, ...args) => func(...args)),
});