/**
 * TabBar 标签栏组件
 * 管理终端标签页的创建、切换、关闭
 * 需求: 3.6, 3.7, 3.8
 */

import type { TerminalType } from '../../shared/types';

/** 标签页数据 */
export interface TabInfo {
  /** 终端实例 ID */
  terminalId: string;
  /** 工作目录路径 */
  cwd: string;
  /** 终端类型 */
  terminalType: TerminalType;
  /** 显示标题（工作目录最后一段） */
  title: string;
}

/** 标签栏事件回调 */
export interface TabBarEvents {
  /** 标签切换时触发 */
  onTabSwitch?: (terminalId: string) => void;
  /** 标签关闭时触发 */
  onTabClose?: (terminalId: string) => void;
}

/** 最大标签页数量 */
const MAX_TABS = 20;

/** 终端类型对应的图标 */
const TERMINAL_TYPE_ICONS: Record<TerminalType, string> = {
  cmd: '⌘',
  powershell: '⚡',
  gitbash: '🐙',
  windowsTerminal: '▣',
};

/**
 * TabBar 标签栏组件
 * 以标签页形式管理多个终端实例
 */
export class TabBar {
  /** 组件根容器 */
  private container: HTMLElement;
  /** 标签列表容器 */
  private tabListEl: HTMLElement;
  /** 所有标签页数据 */
  private tabs: TabInfo[] = [];
  /** 当前激活的标签 ID */
  private activeTabId: string | null = null;
  /** 事件回调 */
  private events: TabBarEvents = {};

  constructor(parentElement: HTMLElement, events?: TabBarEvents) {
    if (events) {
      this.events = events;
    }

    // 创建容器结构
    this.container = document.createElement('div');
    this.container.className = 'tab-bar-container';

    // 标签列表区域
    this.tabListEl = document.createElement('div');
    this.tabListEl.className = 'tab-bar-list';
    this.container.appendChild(this.tabListEl);

    parentElement.appendChild(this.container);
  }

  /**
   * 创建新标签页
   * @param terminalId 终端实例 ID
   * @param cwd 工作目录路径
   * @param terminalType 终端类型
   * @returns 是否创建成功（达到上限时返回 false）
   */
  createTab(terminalId: string, cwd: string, terminalType: TerminalType): boolean {
    // 检查是否达到上限
    if (this.tabs.length >= MAX_TABS) {
      return false;
    }

    // 提取工作目录最后一段作为标题
    const title = cwd.split(/[\\/]/).filter(Boolean).pop() || cwd;

    const tabInfo: TabInfo = {
      terminalId,
      cwd,
      terminalType,
      title,
    };

    this.tabs.push(tabInfo);

    // 渲染新标签并激活
    this.renderTab(tabInfo);
    this.switchTab(terminalId);

    return true;
  }

  /**
   * 切换到指定标签页
   * @param terminalId 终端实例 ID
   */
  switchTab(terminalId: string): void {
    const tab = this.tabs.find(t => t.terminalId === terminalId);
    if (!tab) return;

    this.activeTabId = terminalId;
    this.updateActiveState();

    if (this.events.onTabSwitch) {
      this.events.onTabSwitch(terminalId);
    }
  }

  /**
   * 关闭指定标签页
   * 调用 window.api.closeTerminal 释放资源
   * @param terminalId 终端实例 ID
   */
  async closeTab(terminalId: string): Promise<void> {
    const tabIndex = this.tabs.findIndex(t => t.terminalId === terminalId);
    if (tabIndex === -1) return;

    // 从列表中移除
    this.tabs.splice(tabIndex, 1);

    // 移除 DOM 元素
    const tabEl = this.tabListEl.querySelector(`[data-terminal-id="${terminalId}"]`);
    if (tabEl) {
      tabEl.remove();
    }

    // 如果关闭的是当前激活的标签，切换到相邻标签
    if (this.activeTabId === terminalId) {
      if (this.tabs.length > 0) {
        const newIndex = Math.min(tabIndex, this.tabs.length - 1);
        this.switchTab(this.tabs[newIndex].terminalId);
      } else {
        this.activeTabId = null;
      }
    }

    // 触发关闭事件（由外部处理终端资源释放）
    if (this.events.onTabClose) {
      this.events.onTabClose(terminalId);
    }
  }

  /**
   * 获取当前标签页数量
   */
  getTabCount(): number {
    return this.tabs.length;
  }

  /**
   * 获取当前激活的标签 ID
   */
  getActiveTabId(): string | null {
    return this.activeTabId;
  }

  /**
   * 获取所有标签页信息
   */
  getTabs(): ReadonlyArray<TabInfo> {
    return this.tabs;
  }

  /**
   * 获取组件根元素
   */
  getElement(): HTMLElement {
    return this.container;
  }

  // ===== 私有方法 =====

  /**
   * 渲染单个标签页 DOM 元素
   */
  private renderTab(tabInfo: TabInfo): void {
    const tabEl = document.createElement('div');
    tabEl.className = 'tab-bar-tab';
    tabEl.dataset.terminalId = tabInfo.terminalId;
    tabEl.title = tabInfo.cwd;

    // 终端类型图标
    const iconEl = document.createElement('span');
    iconEl.className = 'tab-bar-tab-icon';
    iconEl.textContent = TERMINAL_TYPE_ICONS[tabInfo.terminalType] || '>';
    tabEl.appendChild(iconEl);

    // 标签标题（工作目录名称）
    const titleEl = document.createElement('span');
    titleEl.className = 'tab-bar-tab-title';
    titleEl.textContent = tabInfo.title;
    tabEl.appendChild(titleEl);

    // 关闭按钮
    const closeBtn = document.createElement('span');
    closeBtn.className = 'tab-bar-tab-close';
    closeBtn.textContent = '×';
    closeBtn.title = '关闭终端';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(tabInfo.terminalId);
    });
    tabEl.appendChild(closeBtn);

    // 点击标签切换
    tabEl.addEventListener('click', () => {
      this.switchTab(tabInfo.terminalId);
    });

    this.tabListEl.appendChild(tabEl);
  }

  /**
   * 更新所有标签的激活状态样式
   */
  private updateActiveState(): void {
    const allTabs = this.tabListEl.querySelectorAll('.tab-bar-tab');
    allTabs.forEach(el => {
      const tabEl = el as HTMLElement;
      if (tabEl.dataset.terminalId === this.activeTabId) {
        tabEl.classList.add('active');
      } else {
        tabEl.classList.remove('active');
      }
    });
  }
}
