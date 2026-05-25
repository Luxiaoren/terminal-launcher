import * as fs from 'fs';
import * as path from 'path';
import { AppConfig, TerminalPaths, WindowState, LayoutConfig, RecentFolder } from '../shared/types';

/**
 * 最近文件夹路径存在性检查结果
 */
export interface RecentFolderWithStatus extends RecentFolder {
  exists: boolean;  // 路径是否存在
}

/**
 * 默认终端路径配置
 */
const DEFAULT_TERMINAL_PATHS: TerminalPaths = {
  cmd: 'cmd.exe',
  powershell: 'powershell.exe',
  gitbash: 'C:\\Program Files\\Git\\bin\\bash.exe',
  windowsTerminal: 'wt.exe',
};

/**
 * 默认窗口状态
 */
const DEFAULT_WINDOW_STATE: WindowState = {
  x: 100,
  y: 100,
  width: 1024,
  height: 768,
  isMaximized: false,
};

/**
 * 默认布局配置
 */
const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  splitRatio: 30,
  terminalVisible: true,
};

/**
 * 获取默认应用配置
 */
export function getDefaultConfig(): AppConfig {
  return {
    defaultTerminalType: 'cmd',
    terminalPaths: { ...DEFAULT_TERMINAL_PATHS },
    recentFolders: [],
    windowState: { ...DEFAULT_WINDOW_STATE },
    layoutConfig: { ...DEFAULT_LAYOUT_CONFIG },
    folderUsageCount: {},
  };
}

/**
 * ConfigManager - 应用配置管理器
 *
 * 负责管理应用配置的持久化存储，配置文件存储在应用目录下的 config 子文件夹中。
 * 支持：
 * - 配置文件的读取、写入、更新
 * - config 文件夹不存在时自动创建并写入默认配置
 * - 配置文件损坏时使用默认配置的容错逻辑
 */
export class ConfigManager {
  private configDir: string;
  private configFilePath: string;
  private config: AppConfig;

  /**
   * @param configDir 配置文件目录路径（可选，默认为应用目录下的 config 文件夹）
   *                  支持注入路径以便于测试
   */
  constructor(configDir?: string) {
    if (configDir) {
      this.configDir = configDir;
    } else {
      // 默认使用应用可执行文件所在目录下的 config 文件夹
      const appDir = path.dirname(process.execPath);
      this.configDir = path.join(appDir, 'config');
    }
    this.configFilePath = path.join(this.configDir, 'settings.json');
    this.config = this.loadConfig();
  }

  /**
   * 获取完整配置
   */
  getConfig(): AppConfig {
    return this.config;
  }

  /**
   * 获取配置文件路径
   */
  getConfigFilePath(): string {
    return this.configFilePath;
  }

  /**
   * 获取配置目录路径
   */
  getConfigDir(): string {
    return this.configDir;
  }

  /**
   * 更新配置（部分更新）
   * @param partial 需要更新的配置字段
   */
  async updateConfig(partial: Partial<AppConfig>): Promise<void> {
    this.config = { ...this.config, ...partial };
    await this.saveConfig();
  }

  /**
   * 添加最近打开的文件夹
   * @param folderPath 文件夹绝对路径
   */
  async addRecentFolder(folderPath: string): Promise<void> {
    const folderName = path.basename(folderPath);
    const now = Date.now();

    // 移除已存在的相同路径记录
    const filtered = this.config.recentFolders.filter(
      (f) => f.path !== folderPath
    );

    // 在列表头部添加新记录
    const newEntry: RecentFolder = {
      path: folderPath,
      name: folderName,
      lastOpened: now,
    };

    filtered.unshift(newEntry);

    // 最多保留 10 条记录
    this.config.recentFolders = filtered.slice(0, 10);

    await this.saveConfig();
  }

  /**
   * 获取最近打开的文件夹列表（按 lastOpened 降序排列，最多 10 条）
   */
  getRecentFolders(): RecentFolder[] {
    return [...this.config.recentFolders]
      .sort((a, b) => b.lastOpened - a.lastOpened)
      .slice(0, 10);
  }

  /**
   * 批量检查最近文件夹路径的存在性
   * Welcome_Page 加载时调用，对每个路径执行存在性检查
   * @returns 带有存在性状态的最近文件夹列表（按 lastOpened 降序）
   */
  async checkRecentFoldersExistence(): Promise<RecentFolderWithStatus[]> {
    const folders = this.getRecentFolders();
    const results: RecentFolderWithStatus[] = await Promise.all(
      folders.map(async (folder) => {
        let exists = false;
        try {
          await fs.promises.access(folder.path, fs.constants.F_OK);
          exists = true;
        } catch {
          // 路径不存在或无法访问
          exists = false;
        }
        return { ...folder, exists };
      })
    );
    return results;
  }

  /**
   * 加载配置文件
   * - 如果 config 目录不存在，自动创建并写入默认配置
   * - 如果配置文件不存在，写入默认配置
   * - 如果配置文件损坏（JSON 解析失败），使用默认配置
   */
  private loadConfig(): AppConfig {
    // 确保 config 目录存在
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    // 如果配置文件不存在，写入默认配置
    if (!fs.existsSync(this.configFilePath)) {
      const defaultConfig = getDefaultConfig();
      this.writeConfigSync(defaultConfig);
      return defaultConfig;
    }

    // 尝试读取并解析配置文件
    try {
      const content = fs.readFileSync(this.configFilePath, 'utf-8');
      const parsed = JSON.parse(content) as Partial<AppConfig>;

      // 合并默认配置，确保缺失字段有默认值
      const defaultConfig = getDefaultConfig();
      return {
        ...defaultConfig,
        ...parsed,
        terminalPaths: { ...defaultConfig.terminalPaths, ...parsed.terminalPaths },
        windowState: { ...defaultConfig.windowState, ...parsed.windowState },
        layoutConfig: { ...defaultConfig.layoutConfig, ...parsed.layoutConfig },
      };
    } catch {
      // 配置文件损坏，使用默认配置
      const defaultConfig = getDefaultConfig();
      // 尝试覆盖损坏的配置文件
      try {
        this.writeConfigSync(defaultConfig);
      } catch {
        // 写入失败时静默处理，不阻止应用启动
      }
      return defaultConfig;
    }
  }

  /**
   * 异步保存配置到文件
   */
  private async saveConfig(): Promise<void> {
    // 确保目录存在
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    const content = JSON.stringify(this.config, null, 2);
    await fs.promises.writeFile(this.configFilePath, content, 'utf-8');
  }

  /**
   * 同步写入配置文件（仅在初始化时使用）
   */
  private writeConfigSync(config: AppConfig): void {
    const content = JSON.stringify(config, null, 2);
    fs.writeFileSync(this.configFilePath, content, 'utf-8');
  }
}
