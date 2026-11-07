const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('OrangeDesktop', {
  fetchText: url => ipcRenderer.invoke('orange:fetch-text', url),
  mediaUrl: url => ipcRenderer.invoke('orange:media-url', url),
})
