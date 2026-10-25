import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('xdDesktop', {
  openFile: (kind: 'design' | 'font') => ipcRenderer.invoke('file:open', kind),
  startupFile: () => ipcRenderer.invoke('file:startup'),
  saveFile: (name: string, bytes: ArrayBuffer) => ipcRenderer.invoke('file:save', name, bytes),
  readWorkspace: () => ipcRenderer.invoke('workspace:read'),
  writeWorkspace: (json: string) => ipcRenderer.invoke('workspace:write', json),
  finishClose: () => ipcRenderer.invoke('window:close'),
  onMenu: (listener: (action: string) => void) => {
    const handler = (_event: unknown, action: string) => listener(action);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  },
});
