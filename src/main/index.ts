import { app, BrowserWindow, Menu, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { ConfigManager } from './config-manager';
import { FileSystemService } from './file-system-service';
import { PtyManager } from './pty-manager';
import { WindowManager } from './window-manager';
import { TerminalTypeResolver } from './terminal-type-resolver';
import { registerIpcHandlers, IPtyManager } from './ipc-handlers';

/**
 * Terminal Launcher 主进程入口
 * 负责应用生命周期管理、窗口创建和模块初始化
 */

// ===== 全局模块实例 =====
let mainWindow: BrowserWindow | null = null;
let configManager: ConfigManager;
let fileSystemService: FileSystemService;
let ptyManager: PtyManager;
let windowManager: WindowManager;

/**
 * 获取应用目录路径
 * portable 模式下使用可执行文件所在目录
 * electron-vite 开发模式下 __dirname 指向 out/main，向上两级即为项目根目录
 */
function getAppDir(): string {
  if (app.isPackaged) {
    return path.dirname(process.execPath);
  }
  // electron-vite 开发模式下 __dirname 已经正确指向 out/main
  return path.resolve(__dirname, '../../');
}

/**
 * 创建 PtyManager 适配器
 * 将 EventEmitter 风格的 PtyManager 适配为 IPtyManager 接口
 * ipc-handlers.ts 需要 onData(terminalId, callback) 和 onExit(terminalId, callback) 方法
 */
function createPtyManagerAdapter(ptyMgr: PtyManager): IPtyManager {
  // 存储每个终端的回调函数
  const dataCallbacks = new Map<string, (data: string) => void>();
  const exitCallbacks = new Map<string, (exitCode: number) => void>();

  // 监听 PtyManager 的 EventEmitter 事件，按 terminalId 分发
  ptyMgr.on('data', (terminalId: string, data: string) => {
    const callback = dataCallbacks.get(terminalId);
    if (callback) {
      callback(data);
    }
  });

  ptyMgr.on('exit', (terminalId: string, exitCode: number) => {
    const callback = exitCallbacks.get(terminalId);
    if (callback) {
      callback(exitCode);
    }
    // 进程退出后清理回调
    dataCallbacks.delete(terminalId);
    exitCallbacks.delete(terminalId);
  });

  return {
    create: (options) => ptyMgr.create(options),
    write: (terminalId, data) => ptyMgr.write(terminalId, data),
    resize: (terminalId, cols, rows) => ptyMgr.resize(terminalId, cols, rows),
    destroy: (terminalId) => ptyMgr.destroy(terminalId),
    onData: (terminalId, callback) => {
      dataCallbacks.set(terminalId, callback);
    },
    onExit: (terminalId, callback) => {
      exitCallbacks.set(terminalId, callback);
    },
  };
}

/**
 * 初始化所有主进程模块
 */
function initializeModules(): void {
  const appDir = getAppDir();
  const configDir = path.join(appDir, 'config');

  // 初始化配置管理器
  configManager = new ConfigManager(configDir);

  // 初始化文件系统服务
  fileSystemService = new FileSystemService();

  // 启动时自动检测终端路径，更新配置
  detectAndUpdateTerminalPaths();

  // 初始化伪终端管理器（node-pty 加载可能失败）
  try {
    ptyManager = new PtyManager();
  } catch (err) {
    console.error('PtyManager 初始化失败（node-pty 加载错误）:', err);
    ptyManager = new PtyManager({
      spawn: () => { throw new Error('node-pty 未正确加载'); }
    });
  }

  // 初始化窗口状态管理器（状态文件存储在 config 目录下）
  const windowStateFilePath = path.join(configDir, 'window-state.json');
  windowManager = new WindowManager(windowStateFilePath);
}

/**
 * 启动时自动检测各终端的可执行文件路径
 * 如果配置中的路径无效，尝试自动检测正确路径
 */
function detectAndUpdateTerminalPaths(): void {
  const resolver = new TerminalTypeResolver();
  const config = configManager.getConfig();
  const paths = { ...config.terminalPaths };
  let changed = false;

  // Git Bash：如果配置路径不存在，自动检测
  if (!paths.gitbash || !fs.existsSync(paths.gitbash)) {
    const detected = resolver.detectGitBashPath();
    if (detected) {
      paths.gitbash = detected;
      changed = true;
    }
  }

  if (changed) {
    configManager.updateConfig({ terminalPaths: paths }).catch(() => {});
  }
}

/**
 * 创建主窗口
 * 使用 WindowManager 恢复上次的窗口状态
 */
function createWindow(): void {
  // 恢复窗口状态（超出屏幕范围时自动回退默认值）
  const windowState = windowManager.restoreState();

  mainWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  // 如果上次是最大化状态，恢复最大化
  if (windowState.isMaximized) {
    mainWindow.maximize();
  }

  // 绑定窗口到 WindowManager，注册 move/resize 事件监听
  windowManager.attach(mainWindow);

  // 注册所有 IPC 处理器
  const ptyAdapter = createPtyManagerAdapter(ptyManager);
  registerIpcHandlers(
    {
      configManager,
      fileSystemService,
      ptyManager: ptyAdapter,
      windowManager,
    },
    mainWindow
  );

  // 窗口准备好后再显示，避免白屏闪烁
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    // 开发模式下打开 DevTools 方便调试
    if (!app.isPackaged) {
      mainWindow?.webContents.openDevTools();
    }
  });

  // 加载欢迎页面
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL + '/pages/welcome.html')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/pages/welcome.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * 创建应用菜单
 * 只保留 File 菜单，包含"打开文件夹"和"最近打开"
 */
function createAppMenu(): void {
  const recentFolders = configManager.getRecentFolders();

  const recentSubmenu = recentFolders.length > 0
    ? recentFolders.map(folder => ({
        label: `${folder.name}  (${folder.path})`,
        click: () => {
          if (mainWindow) {
            const url = process.env.ELECTRON_RENDERER_URL
              ? `${process.env.ELECTRON_RENDERER_URL}/pages/workspace.html?folder=${encodeURIComponent(folder.path)}`
              : undefined;
            if (url) {
              mainWindow.loadURL(url);
            } else {
              mainWindow.loadFile(
                path.join(__dirname, '../renderer/pages/workspace.html'),
                { query: { folder: folder.path } }
              );
            }
          }
        }
      }))
    : [{ label: '(无最近记录)', enabled: false }];

  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        {
          label: '打开文件夹...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            if (!mainWindow) return;
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openDirectory'],
              title: '选择文件夹',
            });
            if (!result.canceled && result.filePaths.length > 0) {
              const folderPath = result.filePaths[0];
              await configManager.addRecentFolder(folderPath);
              // 刷新菜单（更新最近列表）
              createAppMenu();
              // 跳转到工作区
              if (process.env.ELECTRON_RENDERER_URL) {
                mainWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/pages/workspace.html?folder=${encodeURIComponent(folderPath)}`);
              } else {
                mainWindow.loadFile(
                  path.join(__dirname, '../renderer/pages/workspace.html'),
                  { query: { folder: folderPath } }
                );
              }
            }
          }
        },
        { type: 'separator' },
        {
          label: '最近打开',
          submenu: recentSubmenu as Electron.MenuItemConstructorOptions[],
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit(),
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

// ===== 应用生命周期管理 =====

// 应用就绪后初始化模块并创建窗口
app.whenReady().then(() => {
  // 初始化各模块
  initializeModules();

  // 创建主窗口（恢复窗口状态 → 加载欢迎页）
  createWindow();

  // 设置应用菜单
  createAppMenu();
});

// 所有窗口关闭时：保存状态、清理终端、退出应用
app.on('window-all-closed', async () => {
  try {
    // 保存窗口状态
    await windowManager.saveState();
  } catch {
    // 保存失败时静默处理，不阻止退出
  }

  try {
    // 销毁所有终端进程，释放资源
    await ptyManager.destroyAll();
  } catch {
    // 清理失败时静默处理，不阻止退出
  }

  app.quit();
});

// 应用退出前的最终清理（确保终端进程被清理）
app.on('before-quit', async () => {
  try {
    await ptyManager.destroyAll();
  } catch {
    // 静默处理
  }
});

// ===== 全局错误处理 =====

// 处理未捕获异常
process.on('uncaughtException', (error) => {
  console.error('未捕获异常:', error);
  // 尝试保存当前状态后继续运行（不崩溃原则）
  try {
    if (windowManager) {
      windowManager.saveState();
    }
  } catch {
    // 静默处理
  }
});

// 处理未处理的 Promise 拒绝
process.on('unhandledRejection', (reason) => {
  console.error('未处理的 Promise 拒绝:', reason);
});
