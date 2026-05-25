import { BrowserWindow, screen } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { WindowState } from '../shared/types';

/**
 * 默认窗口宽度
 */
const DEFAULT_WIDTH = 1024;

/**
 * 默认窗口高度
 */
const DEFAULT_HEIGHT = 768;

/**
 * 窗口状态管理器
 * 负责窗口大小/位置的保存、恢复，以及超出屏幕范围时的回退处理
 */
export class WindowManager {
  private stateFilePath: string;
  private window: BrowserWindow | null = null;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor(stateFilePath: string) {
    this.stateFilePath = stateFilePath;
  }

  /**
   * 获取默认窗口状态（1024×768 居中于主屏幕）
   */
  getDefaultState(): WindowState {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    const { x: workAreaX, y: workAreaY } = primaryDisplay.workArea;

    return {
      x: workAreaX + Math.round((screenWidth - DEFAULT_WIDTH) / 2),
      y: workAreaY + Math.round((screenHeight - DEFAULT_HEIGHT) / 2),
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      isMaximized: false,
    };
  }

  /**
   * 恢复窗口状态
   * 如果保存的状态超出屏幕范围，回退到默认值
   */
  restoreState(): WindowState {
    const savedState = this.loadState();
    if (!savedState) {
      return this.getDefaultState();
    }

    // 检查保存的状态是否在当前屏幕可用范围内
    if (this.isStateWithinScreenBounds(savedState)) {
      return savedState;
    }

    // 超出屏幕范围，回退默认值
    return this.getDefaultState();
  }

  /**
   * 保存当前窗口状态到文件
   */
  async saveState(): Promise<void> {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    const state: WindowState = {
      ...this.window.getBounds(),
      isMaximized: this.window.isMaximized(),
    };

    // 如果窗口最大化，保存最大化前的位置和大小
    if (state.isMaximized) {
      const savedState = this.loadState();
      if (savedState) {
        state.x = savedState.x;
        state.y = savedState.y;
        state.width = savedState.width;
        state.height = savedState.height;
      }
    }

    await this.writeState(state);
  }

  /**
   * 绑定窗口实例，注册 move/resize 事件监听
   */
  attach(window: BrowserWindow): void {
    this.window = window;

    // 注册窗口移动事件监听
    window.on('move', () => {
      this.debouncedSave();
    });

    // 注册窗口调整大小事件监听
    window.on('resize', () => {
      this.debouncedSave();
    });

    // 窗口关闭前保存状态
    window.on('close', () => {
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = null;
      }
      // 同步保存最终状态
      this.saveStateSync();
    });
  }

  /**
   * 检查窗口状态是否在当前屏幕可用范围内
   */
  isStateWithinScreenBounds(state: WindowState): boolean {
    const displays = screen.getAllDisplays();

    // 检查窗口是否至少部分可见于某个显示器
    for (const display of displays) {
      const { x, y, width, height } = display.workArea;

      // 窗口至少有一部分在该显示器的工作区域内
      const windowRight = state.x + state.width;
      const windowBottom = state.y + state.height;
      const displayRight = x + width;
      const displayBottom = y + height;

      // 检查是否有重叠区域（至少 100px 可见）
      const overlapX = Math.min(windowRight, displayRight) - Math.max(state.x, x);
      const overlapY = Math.min(windowBottom, displayBottom) - Math.max(state.y, y);

      if (overlapX >= 100 && overlapY >= 100) {
        return true;
      }
    }

    return false;
  }

  /**
   * 防抖保存（避免频繁写入文件）
   */
  private debouncedSave(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveState();
    }, 500);
  }

  /**
   * 从文件加载窗口状态
   */
  private loadState(): WindowState | null {
    try {
      if (!fs.existsSync(this.stateFilePath)) {
        return null;
      }
      const data = fs.readFileSync(this.stateFilePath, 'utf-8');
      const state = JSON.parse(data) as WindowState;

      // 验证数据完整性
      if (
        typeof state.x !== 'number' ||
        typeof state.y !== 'number' ||
        typeof state.width !== 'number' ||
        typeof state.height !== 'number' ||
        typeof state.isMaximized !== 'boolean'
      ) {
        return null;
      }

      return state;
    } catch {
      return null;
    }
  }

  /**
   * 异步写入窗口状态到文件
   */
  private async writeState(state: WindowState): Promise<void> {
    try {
      const dir = path.dirname(this.stateFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch {
      // 写入失败时静默处理，不影响应用运行
    }
  }

  /**
   * 同步保存窗口状态（用于窗口关闭时）
   */
  private saveStateSync(): void {
    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    const state: WindowState = {
      ...this.window.getBounds(),
      isMaximized: this.window.isMaximized(),
    };

    if (state.isMaximized) {
      const savedState = this.loadState();
      if (savedState) {
        state.x = savedState.x;
        state.y = savedState.y;
        state.width = savedState.width;
        state.height = savedState.height;
      }
    }

    try {
      const dir = path.dirname(this.stateFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch {
      // 静默处理
    }
  }
}
