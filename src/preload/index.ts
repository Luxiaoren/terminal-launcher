/**
 * Preload 脚本入口
 * 通过 contextBridge 向渲染进程暴露安全的 API
 */
import { contextBridge, ipcRenderer } from 'electron'
import { PTY_CHANNELS, FS_CHANNELS, CONFIG_CHANNELS, WINDOW_CHANNELS } from '../shared/ipc-channels'

const electronAPI = {
  // 文件系统
  openFolderDialog: () => ipcRenderer.invoke(FS_CHANNELS.OPEN_DIALOG),
  readSubfolders: (dirPath: string, usageCount?: Record<string, number>) => ipcRenderer.invoke(FS_CHANNELS.READDIR, dirPath, usageCount),
  checkAccess: (dirPath: string) => ipcRenderer.invoke(FS_CHANNELS.CHECK_ACCESS, dirPath),
  readScripts: (dirPath: string) => ipcRenderer.invoke(FS_CHANNELS.READ_SCRIPTS, dirPath),
  getNodeInfo: () => ipcRenderer.invoke(FS_CHANNELS.GET_NODE_INFO),

  // 终端管理
  createTerminal: (options: any) => ipcRenderer.invoke(PTY_CHANNELS.CREATE, options),
  writeTerminal: (terminalId: string, data: string) => ipcRenderer.send(PTY_CHANNELS.WRITE, terminalId, data),
  resizeTerminal: (terminalId: string, cols: number, rows: number) => ipcRenderer.send(PTY_CHANNELS.RESIZE, terminalId, cols, rows),
  closeTerminal: (terminalId: string) => ipcRenderer.invoke(PTY_CHANNELS.CLOSE, terminalId),
  onTerminalData: (terminalId: string, callback: (data: string) => void) => {
    ipcRenderer.on(`${PTY_CHANNELS.DATA}:${terminalId}`, (_event, data) => callback(data))
  },
  onTerminalExit: (terminalId: string, callback: (code: number) => void) => {
    ipcRenderer.on(`${PTY_CHANNELS.EXIT}:${terminalId}`, (_event, code) => callback(code))
  },
  /** 移除指定终端的数据监听器（关闭/重启终端时调用，避免内存泄漏） */
  offTerminalData: (terminalId: string) => {
    ipcRenderer.removeAllListeners(`${PTY_CHANNELS.DATA}:${terminalId}`)
  },
  /** 移除指定终端的退出监听器（关闭/重启终端时调用，避免内存泄漏） */
  offTerminalExit: (terminalId: string) => {
    ipcRenderer.removeAllListeners(`${PTY_CHANNELS.EXIT}:${terminalId}`)
  },

  // 配置
  getConfig: () => ipcRenderer.invoke(CONFIG_CHANNELS.GET),
  updateConfig: (partial: any) => ipcRenderer.invoke(CONFIG_CHANNELS.UPDATE, partial),
  getRecentFolders: () => ipcRenderer.invoke(CONFIG_CHANNELS.GET_RECENT),
  addRecentFolder: (folderPath: string) => ipcRenderer.invoke(CONFIG_CHANNELS.ADD_RECENT, folderPath),

  // 窗口
  getWindowState: () => ipcRenderer.invoke(WINDOW_CHANNELS.GET_STATE),
  saveWindowState: (state: any) => ipcRenderer.invoke(WINDOW_CHANNELS.SAVE_STATE, state),
}

contextBridge.exposeInMainWorld('api', electronAPI)
