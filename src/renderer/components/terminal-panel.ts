/**
 * TerminalPanel 终端面板组件
 * 管理 xterm.js 终端实例的创建、渲染、数据流和生命周期
 * 需求: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.9, 3.10
 */

import '@xterm/xterm/css/xterm.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import type { PtyCreateOptions, TerminalType } from '../../shared/types';

/** 声明 window.api 类型 */
declare const window: Window & {
  api: {
    createTerminal(options: PtyCreateOptions): Promise<string>;
    writeTerminal(terminalId: string, data: string): void;
    resizeTerminal(terminalId: string, cols: number, rows: number): void;
    closeTerminal(terminalId: string): Promise<void>;
    onTerminalData(terminalId: string, callback: (data: string) => void): void;
    onTerminalExit(terminalId: string, callback: (code: number) => void): void;
    checkAccess(dirPath: string): Promise<{ exists: boolean; readable: boolean; writable: boolean }>;
  };
};

/** 终端面板最大实例数量 */
const MAX_TERMINAL_COUNT = 20;

/** 终端标签页选项 */
export interface TerminalTabOptions {
  cwd: string;
  terminalType: TerminalType;
  shell: string;
  title?: string;
}

/** 单个终端实例的内部状态 */
interface TerminalInstanceState {
  id: string;                // pty 终端 ID
  tabId: string;             // 标签页 ID
  cwd: string;               // 工作目录
  terminalType: TerminalType;
  shell: string;
  xterm: Terminal;           // xterm.js 实例
  fitAddon: FitAddon;        // fit 插件
  webglAddon: WebglAddon | null; // webgl 插件
  containerEl: HTMLElement;  // xterm 挂载容器
  overlayEl: HTMLElement | null; // 覆盖层（退出/错误信息）
  exited: boolean;           // 是否已退出
  exitCode: number | null;   // 退出码
}

/**
 * TerminalPanel 终端面板组件
 * 负责终端实例的创建、渲染、数据流管理和生命周期控制
 */
export class TerminalPanel {
  /** 组件根容器 */
  private container: HTMLElement;
  /** 终端内容区域 */
  private contentEl: HTMLElement;
  /** Toast 提示元素 */
  private toastEl: HTMLElement;
  /** 所有终端实例 */
  private instances: Map<string, TerminalInstanceState> = new Map();
  /** 当前活跃的标签页 ID */
  private activeTabId: string | null = null;
  /** 标签页 ID 计数器 */
  private tabIdCounter = 0;
  /** resize 防抖定时器 */
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(parentElement: HTMLElement) {
    // 创建容器结构
    this.container = document.createElement('div');
    this.container.className = 'terminal-panel-container';

    // 终端内容区域
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'terminal-panel-content';
    this.container.appendChild(this.contentEl);

    // Toast 提示
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'terminal-toast';
    this.container.appendChild(this.toastEl);

    parentElement.appendChild(this.container);

    // 监听窗口 resize 事件，自适应终端尺寸
    window.addEventListener('resize', () => this.handleResize());
  }

  /**
   * 创建新终端标签页
   * @param options 终端创建选项
   * @returns 标签页 ID，如果创建失败返回 null
   */
  async createTab(options: TerminalTabOptions): Promise<string | null> {
    // 检查终端数量上限
    if (this.instances.size >= MAX_TERMINAL_COUNT) {
      this.showToast('已达到最大终端数量（20 个），无法创建新终端');
      return null;
    }

    // 检查路径访问权限
    try {
      const access = await window.api.checkAccess(options.cwd);
      if (!access.exists) {
        this.showToast(`无法打开终端：路径不存在 - ${options.cwd}`);
        return null;
      }
      if (!access.readable) {
        this.showToast(`无法打开终端：无访问权限 - ${options.cwd}`);
        return null;
      }
    } catch (err) {
      this.showToast(`无法打开终端：路径检查失败 - ${(err as Error).message}`);
      return null;
    }

    // 生成标签页 ID
    const tabId = `tab-${++this.tabIdCounter}`;

    // 创建 pty 终端
    let terminalId: string;
    try {
      terminalId = await window.api.createTerminal({
        cwd: options.cwd,
        shell: options.shell,
      });
    } catch (err) {
      const errorMsg = (err as Error).message || '未知错误';
      // 判断是否为数量上限错误
      if (errorMsg.includes('上限') || errorMsg.includes('limit') || errorMsg.includes('maximum')) {
        this.showToast('已达到最大终端数量（20 个），无法创建新终端');
      } else {
        this.showToast(`无法打开终端：${errorMsg}`);
      }
      return null;
    }

    // 创建 xterm.js 实例
    const xterm = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'Cascadia Code', 'Consolas', 'Courier New', monospace",
      theme: {
        background: '#1e1e1e',
        foreground: '#cccccc',
        cursor: '#ffffff',
        selectionBackground: '#264f78',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5',
      },
      scrollback: 5000,
      allowProposedApi: true,
    });

    // 创建 fit 插件
    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    // 创建 xterm 挂载容器
    const xtermContainer = document.createElement('div');
    xtermContainer.className = 'terminal-xterm-container';
    xtermContainer.dataset.tabId = tabId;
    xtermContainer.style.display = 'none'; // 默认隐藏，切换时显示

    this.contentEl.appendChild(xtermContainer);

    // 挂载 xterm 到 DOM
    xterm.open(xtermContainer);

    // 尝试加载 WebGL 插件（加速渲染）
    let webglAddon: WebglAddon | null = null;
    try {
      webglAddon = new WebglAddon();
      xterm.loadAddon(webglAddon);
    } catch {
      // WebGL 不可用时降级为 canvas 渲染，不影响功能
      webglAddon = null;
    }

    // 创建实例状态
    const instance: TerminalInstanceState = {
      id: terminalId,
      tabId,
      cwd: options.cwd,
      terminalType: options.terminalType,
      shell: options.shell,
      xterm,
      fitAddon,
      webglAddon,
      containerEl: xtermContainer,
      overlayEl: null,
      exited: false,
      exitCode: null,
    };

    this.instances.set(tabId, instance);

    // 绑定数据流：pty 输出 → xterm 显示
    window.api.onTerminalData(terminalId, (data: string) => {
      xterm.write(data);
    });

    // 绑定数据流：xterm 输入 → pty 写入
    xterm.onData((data: string) => {
      if (!instance.exited) {
        window.api.writeTerminal(terminalId, data);
      }
    });

    // 监听终端退出事件
    window.api.onTerminalExit(terminalId, (code: number) => {
      instance.exited = true;
      instance.exitCode = code;
      this.showExitOverlay(instance, code);
    });

    // 切换到新创建的标签页
    this.switchTab(tabId);

    // 适配尺寸
    requestAnimationFrame(() => {
      this.fitTerminal(instance);
    });

    return tabId;
  }

  /**
   * 关闭指定标签页
   * @param tabId 标签页 ID
   */
  async closeTab(tabId: string): Promise<void> {
    const instance = this.instances.get(tabId);
    if (!instance) return;

    // 关闭 pty 进程
    try {
      await window.api.closeTerminal(instance.id);
    } catch {
      // 忽略关闭错误（进程可能已退出）
    }

    // 销毁 xterm 实例
    if (instance.webglAddon) {
      instance.webglAddon.dispose();
    }
    instance.fitAddon.dispose();
    instance.xterm.dispose();

    // 移除 DOM 元素
    if (instance.containerEl.parentElement) {
      instance.containerEl.parentElement.removeChild(instance.containerEl);
    }

    // 从管理列表移除
    this.instances.delete(tabId);

    // 如果关闭的是当前活跃标签，切换到其他标签
    if (this.activeTabId === tabId) {
      const remaining = Array.from(this.instances.keys());
      if (remaining.length > 0) {
        this.switchTab(remaining[remaining.length - 1]);
      } else {
        this.activeTabId = null;
      }
    }
  }

  /**
   * 切换到指定标签页
   * @param tabId 标签页 ID
   */
  switchTab(tabId: string): void {
    const instance = this.instances.get(tabId);
    if (!instance) return;

    // 隐藏所有终端容器
    for (const [, inst] of this.instances) {
      inst.containerEl.style.display = 'none';
    }

    // 显示目标终端容器
    instance.containerEl.style.display = 'block';
    this.activeTabId = tabId;

    // 适配尺寸并聚焦
    requestAnimationFrame(() => {
      this.fitTerminal(instance);
      instance.xterm.focus();
    });
  }

  /**
   * 获取当前标签页数量
   */
  getTabCount(): number {
    return this.instances.size;
  }

  /**
   * 获取当前活跃标签页 ID
   */
  getActiveTabId(): string | null {
    return this.activeTabId;
  }

  /**
   * 获取当前活跃终端的 pty terminalId（用于 writeTerminal 等 IPC 调用）
   */
  getActivePtyId(): string | null {
    if (!this.activeTabId) return null;
    const instance = this.instances.get(this.activeTabId);
    return instance ? instance.id : null;
  }

  /**
   * 获取组件根元素
   */
  getElement(): HTMLElement {
    return this.container;
  }

  /**
   * 手动触发所有可见终端的尺寸适配
   * 供外部布局变化时调用
   */
  fitAll(): void {
    if (this.activeTabId) {
      const instance = this.instances.get(this.activeTabId);
      if (instance) {
        this.fitTerminal(instance);
      }
    }
  }

  // ===== 私有方法 =====

  /**
   * 适配终端尺寸到容器大小
   */
  private fitTerminal(instance: TerminalInstanceState): void {
    try {
      instance.fitAddon.fit();
      // 通知主进程调整 pty 尺寸
      const dims = instance.fitAddon.proposeDimensions();
      if (dims && dims.cols && dims.rows) {
        window.api.resizeTerminal(instance.id, dims.cols, dims.rows);
      }
    } catch {
      // fit 可能在 DOM 未就绪时失败，忽略
    }
  }

  /**
   * 处理窗口 resize 事件（防抖）
   */
  private handleResize(): void {
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
    }
    this.resizeTimer = setTimeout(() => {
      this.fitAll();
    }, 100);
  }

  /**
   * 显示终端退出覆盖层
   * @param instance 终端实例
   * @param code 退出码
   */
  private showExitOverlay(instance: TerminalInstanceState, code: number): void {
    // 移除已有覆盖层
    if (instance.overlayEl) {
      instance.overlayEl.remove();
      instance.overlayEl = null;
    }

    const overlay = document.createElement('div');
    overlay.className = 'terminal-overlay';

    if (code === 0) {
      // 正常退出
      overlay.classList.add('exit-normal');
      const msg = document.createElement('span');
      msg.textContent = '进程已结束';
      overlay.appendChild(msg);
    } else {
      // 异常退出
      overlay.classList.add('exit-abnormal');
      const msg = document.createElement('span');
      msg.textContent = `进程异常退出，退出码: ${code}`;
      overlay.appendChild(msg);

      // 重启按钮
      const restartBtn = document.createElement('button');
      restartBtn.className = 'terminal-restart-btn';
      restartBtn.textContent = '重新启动';
      restartBtn.addEventListener('click', () => {
        this.restartTerminal(instance);
      });
      overlay.appendChild(restartBtn);
    }

    instance.containerEl.appendChild(overlay);
    instance.overlayEl = overlay;
  }

  /**
   * 重启终端（异常退出后）
   * @param instance 终端实例
   */
  private async restartTerminal(instance: TerminalInstanceState): Promise<void> {
    // 移除覆盖层
    if (instance.overlayEl) {
      instance.overlayEl.remove();
      instance.overlayEl = null;
    }

    // 清空终端内容
    instance.xterm.clear();
    instance.xterm.reset();
    instance.exited = false;
    instance.exitCode = null;

    // 关闭旧的 pty（如果还在）
    try {
      await window.api.closeTerminal(instance.id);
    } catch {
      // 忽略
    }

    // 创建新的 pty
    try {
      const newTerminalId = await window.api.createTerminal({
        cwd: instance.cwd,
        shell: instance.shell,
      });

      // 更新实例 ID
      instance.id = newTerminalId;

      // 重新绑定数据流
      window.api.onTerminalData(newTerminalId, (data: string) => {
        instance.xterm.write(data);
      });

      window.api.onTerminalExit(newTerminalId, (code: number) => {
        instance.exited = true;
        instance.exitCode = code;
        this.showExitOverlay(instance, code);
      });

      // 适配尺寸
      this.fitTerminal(instance);
      instance.xterm.focus();
    } catch (err) {
      // 重启失败，显示错误
      this.showErrorOverlay(instance, `重启失败: ${(err as Error).message}`);
    }
  }

  /**
   * 显示错误覆盖层
   * @param instance 终端实例
   * @param message 错误信息
   */
  private showErrorOverlay(instance: TerminalInstanceState, message: string): void {
    // 移除已有覆盖层
    if (instance.overlayEl) {
      instance.overlayEl.remove();
      instance.overlayEl = null;
    }

    const overlay = document.createElement('div');
    overlay.className = 'terminal-overlay error';

    const msg = document.createElement('span');
    msg.textContent = message;
    overlay.appendChild(msg);

    instance.containerEl.appendChild(overlay);
    instance.overlayEl = overlay;
  }

  /**
   * 显示 Toast 提示信息
   * @param message 提示内容
   * @param duration 显示时长（毫秒），默认 3000
   */
  private showToast(message: string, duration = 3000): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('visible');

    setTimeout(() => {
      this.toastEl.classList.remove('visible');
    }, duration);
  }
}
