import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import { Channels, type DilemmaBridge, type MenuAction, type OpenedFile } from './ipc.ts'

const bridge: DilemmaBridge = {
  platform: process.platform,
  openCharacter: () => ipcRenderer.invoke(Channels.openCharacter) as Promise<OpenedFile | null>,
  openDroppedFile: (file) =>
    ipcRenderer.invoke(Channels.allowFile, webUtils.getPathForFile(file)) as Promise<OpenedFile>,
  openProject: () => ipcRenderer.invoke(Channels.openProject),
  saveProject: (document, path, saveAs) =>
    ipcRenderer.invoke(Channels.saveProject, document, path, saveAs),
  exportGlb: (bytes, name) => ipcRenderer.invoke(Channels.exportGlb, bytes, name),
  onMenu(listener) {
    const handler = (_event: IpcRendererEvent, action: MenuAction) => listener(action)
    ipcRenderer.on(Channels.menu, handler)
    return () => ipcRenderer.removeListener(Channels.menu, handler)
  },
  onOpenFile(listener) {
    const handler = (_event: IpcRendererEvent, file: OpenedFile) => listener(file)
    ipcRenderer.on(Channels.openFile, handler)
    return () => ipcRenderer.removeListener(Channels.openFile, handler)
  },
}

contextBridge.exposeInMainWorld('dilemma', bridge)
