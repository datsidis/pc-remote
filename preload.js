const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pcRemote', {
  getState: () => ipcRenderer.invoke('get-state'),
  startServer: (port) => ipcRenderer.invoke('start-server', port),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  onStateUpdate: (callback) => {
    ipcRenderer.on('state-update', (_event, state) => callback(state));
  }
});
