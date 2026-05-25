/**
 * IPC 处理器注册模块
 * 负责注册主进程中所有 IPC 通信处理器，连接渲染进程请求与主进程服务
 */
import { ipcMain, BrowserWindow } from 'electron';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { PTY_CHANNELS, FS_CHANNELS, CONFIG_CHANNELS, WINDOW_CHANNELS } from '../shared/ipc-channels';
import type { ConfigManager } from './config-manager';
import type { FileSystemService } from './file-system-service';
import type { WindowManager } from './window-manager';
import type { PtyCreateOptions, AppConfig, WindowState } from '../shared/types';

/**
 * PtyManager 接口定义
 * PtyManager 模块尚未实现，此处定义其接口以便类型检查
 */
export interface IPtyManager {
  /** 创建新的伪终端实例，返回 terminalId */
  create(options: PtyCreateOptions): Promise<string>;
  /** 向指定终端写入数据 */
  write(terminalId: string, data: string): void;
  /** 调整终端尺寸 */
  resize(terminalId: string, cols: number, rows: number): void;
  /** 销毁指定终端 */
  destroy(terminalId: string): Promise<void>;
  /** 注册终端数据输出回调 */
  onData(terminalId: string, callback: (data: string) => void): void;
  /** 注册终端进程退出回调 */
  onExit(terminalId: string, callback: (exitCode: number) => void): void;
}

/**
 * IPC 处理器注册所需的服务依赖
 */
export interface IpcHandlerDependencies {
  configManager: ConfigManager;
  fileSystemService: FileSystemService;
  ptyManager: IPtyManager;
  windowManager: WindowManager;
}

/**
 * 注册所有 IPC 处理器
 * @param deps 服务依赖实例
 * @param mainWindow 主窗口实例（用于向渲染进程推送数据）
 */
export function registerIpcHandlers(deps: IpcHandlerDependencies, mainWindow: BrowserWindow): void {
  const { configManager, fileSystemService, ptyManager, windowManager } = deps;

  // ===== 文件系统相关 IPC 处理器 =====
  registerFileSystemHandlers(fileSystemService);

  // ===== 终端相关 IPC 处理器 =====
  registerPtyHandlers(ptyManager, mainWindow);

  // ===== 配置相关 IPC 处理器 =====
  registerConfigHandlers(configManager);

  // ===== 窗口状态相关 IPC 处理器 =====
  registerWindowHandlers(windowManager);
}

/**
 * 注册文件系统相关 IPC 处理器
 * - fs:readdir: 读取子文件夹列表
 * - fs:checkAccess: 检查路径访问权限
 * - fs:openDialog: 打开文件夹选择对话框
 */
function registerFileSystemHandlers(fileSystemService: FileSystemService): void {
  // 读取目录下的子文件夹列表（支持传入使用次数用于排序）
  ipcMain.handle(FS_CHANNELS.READDIR, async (_event, dirPath: string, usageCount?: Record<string, number>) => {
    return fileSystemService.readSubfolders(dirPath, usageCount);
  });

  // 检查路径存在性和读写权限
  ipcMain.handle(FS_CHANNELS.CHECK_ACCESS, async (_event, dirPath: string) => {
    return fileSystemService.checkAccess(dirPath);
  });

  // 打开系统文件夹选择对话框
  ipcMain.handle(FS_CHANNELS.OPEN_DIALOG, async () => {
    return fileSystemService.openFolderDialog();
  });

  // 读取指定目录下 package.json 中的 scripts 字段
  ipcMain.handle(FS_CHANNELS.READ_SCRIPTS, async (_event, dirPath: string) => {
    const pkgPath = path.join(dirPath, 'package.json');
    try {
      const content = await fs.promises.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(content);
      return pkg.scripts || null;
    } catch {
      return null; // 没有 package.json 或解析失败
    }
  });

  // 获取 node 版本和 nvm 列表
  ipcMain.handle(FS_CHANNELS.GET_NODE_INFO, async () => {
    const result: { nodeVersion: string | null; nvmInstalled: boolean; nvmList: string[] } = {
      nodeVersion: null,
      nvmInstalled: false,
      nvmList: [],
    };

    // 获取 node 版本
    try {
      result.nodeVersion = execSync('node -v', { encoding: 'utf-8', timeout: 5000 }).trim();
    } catch {}

    // 检测 nvm 并获取版本列表（Windows 版 nvm 不支持非交互式调用，直接读取安装目录）
    try {
      // nvm for Windows 默认安装路径在 NVM_HOME 环境变量中
      const nvmHome = process.env.NVM_HOME;
      if (nvmHome && fs.existsSync(nvmHome)) {
        result.nvmInstalled = true;
        // nvm 安装的各版本在 NVM_HOME 下以 v版本号 命名的文件夹
        const entries = fs.readdirSync(nvmHome, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const match = entry.name.match(/^v?(\d+\.\d+\.\d+)$/);
            if (match) {
              result.nvmList.push(match[1]);
            }
          }
        }
        // 按版本号降序排列
        result.nvmList.sort((a, b) => {
          const pa = a.split('.').map(Number);
          const pb = b.split('.').map(Number);
          for (let i = 0; i < 3; i++) {
            if (pa[i] !== pb[i]) return pb[i] - pa[i];
          }
          return 0;
        });
      }
    } catch {
      // nvm 未安装或读取失败
    }

    return result;
  });
}

/**
 * 注册终端相关 IPC 处理器
 * - pty:create: 创建伪终端（invoke）
 * - pty:write: 向终端写入数据（send，单向）
 * - pty:resize: 调整终端尺寸（send，单向）
 * - pty:close: 关闭终端（invoke）
 * - pty:data: 终端输出数据（主进程主动推送到渲染进程）
 * - pty:exit: 终端进程退出（主进程主动推送到渲染进程）
 */
function registerPtyHandlers(ptyManager: IPtyManager, mainWindow: BrowserWindow): void {
  // 创建伪终端实例
  ipcMain.handle(PTY_CHANNELS.CREATE, async (_event, options: PtyCreateOptions) => {
    const terminalId = await ptyManager.create(options);

    // 注册数据输出回调，将终端输出推送到渲染进程
    ptyManager.onData(terminalId, (data: string) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`${PTY_CHANNELS.DATA}:${terminalId}`, data);
      }
    });

    // 注册进程退出回调，将退出事件推送到渲染进程
    ptyManager.onExit(terminalId, (exitCode: number) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`${PTY_CHANNELS.EXIT}:${terminalId}`, exitCode);
      }
    });

    return terminalId;
  });

  // 向终端写入数据（单向消息，无需返回值）
  ipcMain.on(PTY_CHANNELS.WRITE, (_event, terminalId: string, data: string) => {
    ptyManager.write(terminalId, data);
  });

  // 调整终端尺寸（单向消息，无需返回值）
  ipcMain.on(PTY_CHANNELS.RESIZE, (_event, terminalId: string, cols: number, rows: number) => {
    ptyManager.resize(terminalId, cols, rows);
  });

  // 关闭终端
  ipcMain.handle(PTY_CHANNELS.CLOSE, async (_event, terminalId: string) => {
    await ptyManager.destroy(terminalId);
  });
}

/**
 * 注册配置相关 IPC 处理器
 * - config:get: 获取完整配置
 * - config:update: 更新配置
 * - config:getRecent: 获取最近文件夹列表
 * - config:addRecent: 添加最近文件夹
 */
function registerConfigHandlers(configManager: ConfigManager): void {
  // 获取完整配置
  ipcMain.handle(CONFIG_CHANNELS.GET, async () => {
    return configManager.getConfig();
  });

  // 更新配置（部分更新）
  ipcMain.handle(CONFIG_CHANNELS.UPDATE, async (_event, partial: Partial<AppConfig>) => {
    await configManager.updateConfig(partial);
  });

  // 获取最近文件夹列表
  ipcMain.handle(CONFIG_CHANNELS.GET_RECENT, async () => {
    return configManager.getRecentFolders();
  });

  // 添加最近文件夹
  ipcMain.handle(CONFIG_CHANNELS.ADD_RECENT, async (_event, folderPath: string) => {
    await configManager.addRecentFolder(folderPath);
  });
}

/**
 * 注册窗口状态相关 IPC 处理器
 * - window:getState: 获取窗口状态
 * - window:saveState: 保存窗口状态
 */
function registerWindowHandlers(windowManager: WindowManager): void {
  // 获取窗口状态
  ipcMain.handle(WINDOW_CHANNELS.GET_STATE, async () => {
    return windowManager.restoreState();
  });

  // 保存窗口状态
  ipcMain.handle(WINDOW_CHANNELS.SAVE_STATE, async (_event, state: WindowState) => {
    // WindowManager 内部通过 attach 自动保存，此处提供手动保存接口
    await windowManager.saveState();
  });
}
