/**
 * DirectoryTree 目录树组件
 * 展示文件夹层级结构，支持展开/折叠、加载状态、错误处理
 * 需求: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 3.1
 */

import type { FolderEntry } from '../../shared/types';
import { compareFolderNames } from '../../shared/sort-utils';

/** 声明 window.api 类型 */
declare const window: Window & {
  api: {
    readSubfolders(dirPath: string, usageCount?: Record<string, number>): Promise<FolderEntry[]>;
  };
};

/** 树节点内部状态 */
interface TreeNodeState {
  entry: FolderEntry;
  depth: number;
  expanded: boolean;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  children: TreeNodeState[];
}

/** 加载超时阈值（毫秒） */
const LOADING_TIMEOUT_MS = 500;

/** 单击/双击区分延迟（毫秒）：单击在此延迟后若无第二次点击才执行展开/折叠 */
const CLICK_DELAY_MS = 250;

/**
 * DirectoryTree 目录树组件
 * 管理树形 DOM 结构，处理展开/折叠、加载、错误等状态
 */
export class DirectoryTree {
  /** 组件根容器 */
  private container: HTMLElement;
  /** 头部元素（显示 Workspace_Folder 名称） */
  private headerEl: HTMLElement;
  /** 树内容区域 */
  private contentEl: HTMLElement;
  /** 当前根路径 */
  private rootPath: string = '';
  /** 根节点状态列表 */
  private rootNodes: TreeNodeState[] = [];
  /** 双击回调 */
  private doubleClickCallback: ((path: string) => void) | null = null;
  /** 文件夹使用次数（用于排序） */
  private usageCount: Record<string, number> = {};
  /** 单击延迟定时器（用于区分单击与双击） */
  private clickTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(parentElement: HTMLElement) {
    // 创建容器结构
    this.container = document.createElement('div');
    this.container.className = 'directory-tree-container';

    // 头部：显示 Workspace_Folder 名称
    this.headerEl = document.createElement('div');
    this.headerEl.className = 'directory-tree-header';
    this.headerEl.textContent = '';
    this.container.appendChild(this.headerEl);

    // 树内容区域
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'directory-tree-content';
    this.container.appendChild(this.contentEl);

    parentElement.appendChild(this.container);
  }

  /**
   * 设置文件夹使用次数数据（用于排序）
   */
  setUsageCount(usageCount: Record<string, number>): void {
    this.usageCount = usageCount;
  }

  /**
   * 设置根目录并渲染顶层子文件夹
   * @param folderPath 工作区根文件夹路径
   */
  async setRoot(folderPath: string): Promise<void> {
    this.rootPath = folderPath;
    // 面板顶部显示当前 Workspace_Folder 名称
    const folderName = folderPath.split(/[\\/]/).filter(Boolean).pop() || folderPath;
    this.headerEl.textContent = folderName;
    this.headerEl.title = folderPath;

    // 清空内容
    this.contentEl.innerHTML = '';
    this.rootNodes = [];

    // 加载根目录下的子文件夹
    try {
      const entries = await window.api.readSubfolders(folderPath, this.usageCount);
      this.rootNodes = entries.map(entry => this.createNodeState(entry, 0));
      this.renderNodes(this.rootNodes, this.contentEl);
    } catch (err) {
      // 根目录加载失败，显示错误
      const errorEl = document.createElement('div');
      errorEl.className = 'tree-error-indicator';
      errorEl.textContent = `加载失败: ${(err as Error).message || '未知错误'}`;
      this.contentEl.appendChild(errorEl);
    }
  }

  /**
   * 展开指定路径的节点
   * @param nodePath 节点绝对路径
   */
  async expandNode(nodePath: string): Promise<void> {
    const nodeState = this.findNodeState(nodePath, this.rootNodes);
    if (!nodeState) return;
    if (!nodeState.entry.accessible) return;
    if (!nodeState.entry.hasChildren) return;

    await this.doExpand(nodeState);
  }

  /**
   * 折叠指定路径的节点
   * @param nodePath 节点绝对路径
   */
  collapseNode(nodePath: string): void {
    const nodeState = this.findNodeState(nodePath, this.rootNodes);
    if (!nodeState) return;

    nodeState.expanded = false;
    this.updateNodeDOM(nodeState);
  }

  /**
   * 注册双击文件夹的回调（用于打开终端）
   * @param callback 回调函数，参数为文件夹绝对路径
   */
  onFolderDoubleClick(callback: (path: string) => void): void {
    this.doubleClickCallback = callback;
  }

  /**
   * 按最新的使用次数重新排序目录树并刷新视图
   * 保留各节点已展开/已加载的状态，不重新读取磁盘
   */
  refreshSort(): void {
    this.sortNodes(this.rootNodes);
    // 重新渲染整棵树（节点状态中保留了 expanded/loaded/children，重渲染会还原展开状态）
    this.contentEl.innerHTML = '';
    this.renderNodes(this.rootNodes, this.contentEl);
  }

  /**
   * 递归地按使用次数与名称对节点列表排序
   * 排序规则与主进程 readSubfolders 保持一致：
   * 优先按使用次数降序，次数相同按 compareFolderNames 字典序
   */
  private sortNodes(nodes: TreeNodeState[]): void {
    nodes.sort((a, b) => {
      const countA = this.usageCount[a.entry.path] || 0;
      const countB = this.usageCount[b.entry.path] || 0;
      if (countA !== countB) {
        return countB - countA;
      }
      return compareFolderNames(a.entry.name, b.entry.name);
    });
    // 递归排序已加载的子节点
    for (const node of nodes) {
      if (node.children.length > 0) {
        this.sortNodes(node.children);
      }
    }
  }

  /**
   * 获取组件根元素
   */
  getElement(): HTMLElement {
    return this.container;
  }

  // ===== 私有方法 =====

  /**
   * 创建节点状态对象
   */
  private createNodeState(entry: FolderEntry, depth: number): TreeNodeState {
    return {
      entry,
      depth,
      expanded: false,
      loaded: false,
      loading: false,
      error: null,
      children: [],
    };
  }

  /**
   * 渲染节点列表到指定容器
   */
  private renderNodes(nodes: TreeNodeState[], container: HTMLElement): void {
    for (const node of nodes) {
      const nodeEl = this.createNodeElement(node);
      container.appendChild(nodeEl);
    }
  }

  /**
   * 创建单个节点的 DOM 元素（含子节点容器）
   */
  private createNodeElement(nodeState: TreeNodeState): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.dataset.path = nodeState.entry.path;
    wrapper.className = 'tree-node-wrapper';

    // 节点行
    const nodeRow = document.createElement('div');
    nodeRow.className = 'tree-node';
    if (!nodeState.entry.accessible) {
      nodeRow.classList.add('inaccessible');
    }

    // 缩进
    for (let i = 0; i < nodeState.depth; i++) {
      const indent = document.createElement('span');
      indent.className = 'tree-node-indent';
      nodeRow.appendChild(indent);
    }

    // 展开/折叠箭头（或占位）
    if (nodeState.entry.accessible && nodeState.entry.hasChildren) {
      const arrow = document.createElement('span');
      arrow.className = 'tree-node-arrow';
      if (nodeState.expanded) {
        arrow.classList.add('expanded');
      }
      arrow.textContent = '▶';
      // 点击箭头展开/折叠
      arrow.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleArrowClick(nodeState);
      });
      nodeRow.appendChild(arrow);
    } else {
      // 叶节点或不可访问：不显示箭头，用占位
      const placeholder = document.createElement('span');
      placeholder.className = 'tree-node-arrow-placeholder';
      nodeRow.appendChild(placeholder);
    }

    // 文件夹图标
    const icon = document.createElement('span');
    icon.className = 'tree-node-icon';
    icon.textContent = '📁';
    nodeRow.appendChild(icon);

    // 文件夹名称
    const label = document.createElement('span');
    label.className = 'tree-node-label';
    label.textContent = nodeState.entry.name;
    label.title = nodeState.entry.path;
    nodeRow.appendChild(label);

    // 单击行：展开/折叠（叶节点无操作）；双击行：打开终端
    // 用延迟定时器区分单击与双击，避免双击时误触发展开
    if (nodeState.entry.accessible) {
      nodeRow.addEventListener('click', (e) => {
        // 箭头自身的点击已 stopPropagation，这里只处理行其余区域
        e.stopPropagation();
        if (this.clickTimer) {
          clearTimeout(this.clickTimer);
        }
        this.clickTimer = setTimeout(() => {
          this.clickTimer = null;
          // 仅当有子文件夹时才展开/折叠
          if (nodeState.entry.hasChildren) {
            this.handleArrowClick(nodeState);
          }
        }, CLICK_DELAY_MS);
      });

      nodeRow.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        // 取消待执行的单击展开，避免双击同时触发展开
        if (this.clickTimer) {
          clearTimeout(this.clickTimer);
          this.clickTimer = null;
        }
        if (this.doubleClickCallback) {
          this.doubleClickCallback(nodeState.entry.path);
        }
      });
    }

    wrapper.appendChild(nodeRow);

    // 子节点容器
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'tree-node-children';
    if (nodeState.expanded) {
      childrenContainer.classList.add('expanded');
    }
    // 如果已加载子节点，渲染它们
    if (nodeState.loaded && nodeState.children.length > 0) {
      this.renderNodes(nodeState.children, childrenContainer);
    }
    wrapper.appendChild(childrenContainer);

    // 将 wrapper 引用存储到 nodeState 以便后续更新
    (nodeState as any)._element = wrapper;

    return wrapper;
  }

  /**
   * 处理箭头点击：展开或折叠
   */
  private async handleArrowClick(nodeState: TreeNodeState): Promise<void> {
    if (nodeState.expanded) {
      // 折叠
      nodeState.expanded = false;
      this.updateNodeDOM(nodeState);
    } else {
      // 展开
      await this.doExpand(nodeState);
    }
  }

  /**
   * 执行展开操作：加载子文件夹并更新 DOM
   */
  private async doExpand(nodeState: TreeNodeState): Promise<void> {
    if (nodeState.loading) return;

    // 如果已加载过，直接展开
    if (nodeState.loaded) {
      nodeState.expanded = true;
      nodeState.error = null;
      this.updateNodeDOM(nodeState);
      return;
    }

    // 开始加载
    nodeState.loading = true;
    nodeState.error = null;

    // 500ms 超时后显示加载指示器
    let showLoadingTimer: ReturnType<typeof setTimeout> | null = null;
    showLoadingTimer = setTimeout(() => {
      if (nodeState.loading) {
        this.showLoadingIndicator(nodeState);
      }
    }, LOADING_TIMEOUT_MS);

    try {
      const entries = await window.api.readSubfolders(nodeState.entry.path, this.usageCount);

      // 清除超时计时器
      if (showLoadingTimer) {
        clearTimeout(showLoadingTimer);
        showLoadingTimer = null;
      }

      // 更新节点状态
      nodeState.children = entries.map(entry => this.createNodeState(entry, nodeState.depth + 1));
      nodeState.loaded = true;
      nodeState.loading = false;
      nodeState.expanded = true;

      // 如果加载后发现没有子文件夹，更新 hasChildren 标记
      if (entries.length === 0) {
        nodeState.entry.hasChildren = false;
      }

      this.updateNodeDOM(nodeState);
    } catch (err) {
      // 清除超时计时器
      if (showLoadingTimer) {
        clearTimeout(showLoadingTimer);
        showLoadingTimer = null;
      }

      // 加载失败：显示错误，保留可重试状态
      nodeState.loading = false;
      nodeState.error = (err as Error).message || '加载失败';
      nodeState.loaded = false; // 保留可重试状态

      this.updateNodeDOM(nodeState);
    }
  }

  /**
   * 显示加载指示器
   */
  private showLoadingIndicator(nodeState: TreeNodeState): void {
    const wrapper = (nodeState as any)._element as HTMLElement;
    if (!wrapper) return;

    const childrenContainer = wrapper.querySelector('.tree-node-children') as HTMLElement;
    if (!childrenContainer) return;

    // 清空并显示加载指示器
    childrenContainer.innerHTML = '';
    const loadingEl = document.createElement('div');
    loadingEl.className = 'tree-loading-indicator';
    // 缩进与子节点对齐
    loadingEl.style.paddingLeft = `${(nodeState.depth + 1) * 16 + 16}px`;
    loadingEl.textContent = '加载中...';
    childrenContainer.appendChild(loadingEl);
    childrenContainer.classList.add('expanded');
  }

  /**
   * 更新节点 DOM（重新渲染该节点）
   */
  private updateNodeDOM(nodeState: TreeNodeState): void {
    const oldWrapper = (nodeState as any)._element as HTMLElement;
    if (!oldWrapper || !oldWrapper.parentElement) return;

    const parent = oldWrapper.parentElement;
    const newWrapper = this.createNodeElement(nodeState);

    // 如果有错误，在子节点容器中显示错误提示
    if (nodeState.error) {
      const childrenContainer = newWrapper.querySelector('.tree-node-children') as HTMLElement;
      if (childrenContainer) {
        childrenContainer.innerHTML = '';
        const errorEl = document.createElement('div');
        errorEl.className = 'tree-error-indicator';
        errorEl.style.paddingLeft = `${(nodeState.depth + 1) * 16 + 16}px`;
        errorEl.textContent = nodeState.error;
        childrenContainer.appendChild(errorEl);
        childrenContainer.classList.add('expanded');
      }
    }

    parent.replaceChild(newWrapper, oldWrapper);
  }

  /**
   * 递归查找指定路径的节点状态
   */
  private findNodeState(path: string, nodes: TreeNodeState[]): TreeNodeState | null {
    for (const node of nodes) {
      if (node.entry.path === path) {
        return node;
      }
      if (node.children.length > 0) {
        const found = this.findNodeState(path, node.children);
        if (found) return found;
      }
    }
    return null;
  }
}
