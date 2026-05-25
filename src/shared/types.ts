/**
 * 共享类型定义
 * 主进程和渲染进程共用的接口和类型
 */

/** 终端类型 */
export type TerminalType = 'cmd' | 'powershell' | 'gitbash' | 'windowsTerminal';

/** 各终端类型的可执行文件路径配置 */
export interface TerminalPaths {
  cmd: string;
  powershell: string;
  gitbash: string;
  windowsTerminal: string;
}

/** 最近打开的文件夹记录 */
export interface RecentFolder {
  path: string;           // 文件夹绝对路径
  name: string;           // 文件夹名称（显示用）
  lastOpened: number;     // 最后打开时间戳（毫秒）
}

/** 窗口状态 */
export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

/** 布局配置 */
export interface LayoutConfig {
  splitRatio: number;       // 左侧面板宽度百分比 (15-85)
  terminalVisible: boolean;
}

/** 应用配置 */
export interface AppConfig {
  defaultTerminalType: TerminalType;
  terminalPaths: TerminalPaths;
  recentFolders: RecentFolder[];
  windowState: WindowState;
  layoutConfig: LayoutConfig;
  /** 文件夹使用次数统计（路径 → 打开终端次数） */
  folderUsageCount: Record<string, number>;
}

/** 文件夹条目 */
export interface FolderEntry {
  name: string;           // 文件夹名称
  path: string;           // 绝对路径
  accessible: boolean;    // 是否可访问
  hasChildren: boolean;   // 是否有子文件夹
}

/** 路径访问检查结果 */
export interface AccessCheckResult {
  exists: boolean;
  readable: boolean;
  writable: boolean;
}

/** 伪终端创建选项 */
export interface PtyCreateOptions {
  cwd: string;
  shell: string;
  args?: string[];
  env?: Record<string, string>;
}

/** 终端实例状态 */
export type TerminalStatus = 'running' | 'exited' | 'error';

/** 终端实例运行时数据 */
export interface TerminalInstance {
  id: string;
  cwd: string;
  terminalType: TerminalType;
  pid: number;
  status: TerminalStatus;
  createdAt: number;
  exitCode?: number;
}

/**
 * 渲染进程可用的安全 API 接口
 * 通过 contextBridge 暴露到 window.api
 */
export interface ElectronAPI {
  // 文件系统
  openFolderDialog(): Promise<string | null>;
  readSubfolders(dirPath: string): Promise<FolderEntry[]>;
  checkAccess(dirPath: string): Promise<AccessCheckResult>;

  // 终端管理
  createTerminal(options: PtyCreateOptions): Promise<string>;
  writeTerminal(terminalId: string, data: string): void;
  resizeTerminal(terminalId: string, cols: number, rows: number): void;
  closeTerminal(terminalId: string): Promise<void>;
  onTerminalData(terminalId: string, callback: (data: string) => void): void;
  onTerminalExit(terminalId: string, callback: (code: number) => void): void;

  // 配置
  getConfig(): Promise<AppConfig>;
  updateConfig(partial: Partial<AppConfig>): Promise<void>;
  getRecentFolders(): Promise<RecentFolder[]>;
  addRecentFolder(path: string): Promise<void>;

  // 窗口
  getWindowState(): Promise<WindowState>;
  saveWindowState(state: WindowState): Promise<void>;
}
