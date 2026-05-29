/**
 * LayoutManager 布局管理组件
 * 处理左右分栏布局、分隔条拖拽、终端面板显隐
 * 需求: 6.1, 6.2, 6.3, 6.6
 */

import type { LayoutConfig } from '../../shared/types';

/**
 * LayoutManager 布局管理组件
 * 管理左右分栏布局，支持拖拽调整比例和终端面板切换
 */
export class LayoutManager {
  /** 组件根容器 */
  private container: HTMLElement;
  /** 左侧面板（目录树） */
  private leftPanel: HTMLElement;
  /** 右侧面板（终端） */
  private rightPanel: HTMLElement;
  /** 可拖拽分隔条 */
  private divider: HTMLElement;
  /** 右侧引导提示元素 */
  private guideEl: HTMLElement;
  /** 当前分栏比例（左侧宽度百分比） */
  private splitRatio: number = 30;
  /** 终端面板是否可见 */
  private terminalVisible: boolean = true;
  /** 是否正在拖拽 */
  private isDragging: boolean = false;
  /** 布局变化回调 */
  private onLayoutChangeCallback: ((config: LayoutConfig) => void) | null = null;
  /** 全局鼠标移动监听器（保留引用以便组件销毁时移除） */
  private mouseMoveHandler: (e: MouseEvent) => void;
  /** 全局鼠标释放监听器（保留引用以便组件销毁时移除） */
  private mouseUpHandler: () => void;
  /** 全局键盘监听器（保留引用以便组件销毁时移除） */
  private keyDownHandler: (e: KeyboardEvent) => void;

  constructor(parentElement: HTMLElement) {
    // 创建根容器
    this.container = document.createElement('div');
    this.container.className = 'layout-manager-container';

    // 左侧面板
    this.leftPanel = document.createElement('div');
    this.leftPanel.className = 'layout-panel layout-panel-left';
    this.container.appendChild(this.leftPanel);

    // 分隔条
    this.divider = document.createElement('div');
    this.divider.className = 'layout-divider';
    this.container.appendChild(this.divider);

    // 右侧面板
    this.rightPanel = document.createElement('div');
    this.rightPanel.className = 'layout-panel layout-panel-right';
    this.container.appendChild(this.rightPanel);

    // 引导提示（未打开终端时显示）
    this.guideEl = document.createElement('div');
    this.guideEl.className = 'layout-guide-text';
    this.guideEl.textContent = '双击左侧文件夹打开终端';
    this.rightPanel.appendChild(this.guideEl);

    parentElement.appendChild(this.container);

    // 初始化全局监听器引用（绑定后用于 add/remove）
    this.mouseMoveHandler = (e: MouseEvent) => this.handleDividerMouseMove(e);
    this.mouseUpHandler = () => this.handleDividerMouseUp();
    this.keyDownHandler = (e: KeyboardEvent) => this.handleKeyDown(e);

    // 绑定分隔条拖拽事件
    this.bindDividerEvents();

    // 绑定快捷键
    this.bindKeyboardShortcuts();
  }

  /**
   * 初始化布局配置
   * @param config 布局配置
   */
  init(config: LayoutConfig): void {
    this.splitRatio = this.clampRatio(config.splitRatio);
    this.terminalVisible = config.terminalVisible;
    this.applyLayout();
  }

  /**
   * 设置分栏比例
   * @param leftPercent 左侧面板宽度百分比（会被钳制到 15-85）
   */
  setSplitRatio(leftPercent: number): void {
    this.splitRatio = this.clampRatio(leftPercent);
    if (this.terminalVisible) {
      this.applyLayout();
    }
  }

  /**
   * 切换终端面板显隐
   * 隐藏时目录树扩展至全宽，显示时恢复分栏比例
   */
  toggleTerminalPanel(): void {
    this.terminalVisible = !this.terminalVisible;
    this.applyLayout();

    // 通知布局变化
    if (this.onLayoutChangeCallback) {
      this.onLayoutChangeCallback(this.saveLayout());
    }
  }

  /**
   * 保存当前布局状态
   * @returns 当前布局配置
   */
  saveLayout(): LayoutConfig {
    return {
      splitRatio: this.splitRatio,
      terminalVisible: this.terminalVisible,
    };
  }

  /**
   * 获取左侧面板元素（用于挂载目录树组件）
   */
  getLeftPanel(): HTMLElement {
    return this.leftPanel;
  }

  /**
   * 获取右侧面板元素（用于挂载终端面板组件）
   */
  getRightPanel(): HTMLElement {
    return this.rightPanel;
  }

  /**
   * 获取组件根元素
   */
  getElement(): HTMLElement {
    return this.container;
  }

  /**
   * 设置布局变化回调
   * @param callback 布局变化时触发的回调
   */
  onLayoutChange(callback: (config: LayoutConfig) => void): void {
    this.onLayoutChangeCallback = callback;
  }

  /**
   * 显示或隐藏引导提示
   * @param visible 是否显示引导提示
   */
  setGuideVisible(visible: boolean): void {
    this.guideEl.style.display = visible ? 'flex' : 'none';
  }

  /**
   * 获取终端面板是否可见
   */
  isTerminalVisible(): boolean {
    return this.terminalVisible;
  }

  /**
   * 获取当前分栏比例
   */
  getSplitRatio(): number {
    return this.splitRatio;
  }

  /**
   * 销毁组件，移除所有全局监听器
   */
  destroy(): void {
    document.removeEventListener('mousemove', this.mouseMoveHandler);
    document.removeEventListener('mouseup', this.mouseUpHandler);
    document.removeEventListener('keydown', this.keyDownHandler);
    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }

  // ===== 私有方法 =====

  /**
   * 将比例值钳制到 15-85 范围
   */
  private clampRatio(value: number): number {
    return Math.max(15, Math.min(85, value));
  }

  /**
   * 应用当前布局状态到 DOM
   */
  private applyLayout(): void {
    if (this.terminalVisible) {
      // 显示终端面板：左侧固定百分比，右侧用 flex 填充剩余空间
      this.leftPanel.style.width = `${this.splitRatio}%`;
      this.leftPanel.style.flex = '0 0 auto';
      this.rightPanel.style.width = '';
      this.rightPanel.style.flex = '1 1 0';
      this.rightPanel.style.display = 'flex';
      this.divider.style.display = 'block';
    } else {
      // 隐藏终端面板：左侧全宽
      this.leftPanel.style.width = '100%';
      this.leftPanel.style.flex = '0 0 auto';
      this.rightPanel.style.display = 'none';
      this.divider.style.display = 'none';
    }
  }

  /**
   * 绑定分隔条拖拽事件
   */
  private bindDividerEvents(): void {
    // 鼠标按下开始拖拽
    this.divider.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      this.isDragging = true;
      this.container.classList.add('dragging');
    });

    // 鼠标移动/释放使用成员引用，便于销毁时移除
    document.addEventListener('mousemove', this.mouseMoveHandler);
    document.addEventListener('mouseup', this.mouseUpHandler);
  }

  /**
   * 拖拽过程中的鼠标移动处理
   */
  private handleDividerMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;
    e.preventDefault();

    const containerRect = this.container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    if (containerWidth === 0) return;

    // 计算鼠标位置对应的左侧面板百分比
    const mouseX = e.clientX - containerRect.left;
    const newRatio = (mouseX / containerWidth) * 100;

    // 钳制到 15%-85% 范围
    this.splitRatio = this.clampRatio(newRatio);
    this.applyLayout();
  }

  /**
   * 拖拽结束的鼠标释放处理
   */
  private handleDividerMouseUp(): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.container.classList.remove('dragging');

    // 通知布局变化
    if (this.onLayoutChangeCallback) {
      this.onLayoutChangeCallback(this.saveLayout());
    }
  }

  /**
   * 绑定键盘快捷键
   * Ctrl+` 切换终端面板显隐
   */
  private bindKeyboardShortcuts(): void {
    document.addEventListener('keydown', this.keyDownHandler);
  }

  /**
   * 全局键盘事件处理
   */
  private handleKeyDown(e: KeyboardEvent): void {
    // Ctrl+` 切换终端面板
    if (e.ctrlKey && e.key === '`') {
      e.preventDefault();
      this.toggleTerminalPanel();
    }
  }
}
