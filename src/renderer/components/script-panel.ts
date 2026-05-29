/**
 * ScriptPanel 脚本面板组件
 * 上半部分：npm scripts 列表
 * 下半部分：Node 版本信息 + nvm 版本切换
 */

import './script-panel.css';

/** 脚本面板配置选项 */
export interface ScriptPanelOptions {
  /** 点击执行按钮时的回调，参数为完整命令 */
  onRunScript: (command: string) => void;
  /** 点击关闭按钮时的回调 */
  onClose: () => void;
}

// 声明 window.api
declare const window: Window & { api: any };

/**
 * ScriptPanel 脚本面板组件
 */
export class ScriptPanel {
  private container: HTMLElement;
  private dividerEl: HTMLElement;
  private scriptListEl: HTMLElement;
  private nodeInfoEl: HTMLElement;
  private options: ScriptPanelOptions;
  /** 当前面板宽度（px） */
  private panelWidth: number = 280;
  /** 全局鼠标移动监听器（保留引用以便组件销毁时移除） */
  private mouseMoveHandler: (e: MouseEvent) => void = () => {};
  /** 全局鼠标释放监听器（保留引用以便组件销毁时移除） */
  private mouseUpHandler: () => void = () => {};

  constructor(parentElement: HTMLElement, options: ScriptPanelOptions) {
    this.options = options;

    // 创建左侧拖拽分隔条
    this.dividerEl = document.createElement('div');
    this.dividerEl.className = 'script-panel-divider-bar';
    parentElement.appendChild(this.dividerEl);

    // 根容器
    this.container = document.createElement('div');
    this.container.className = 'script-panel';
    this.container.style.width = `${this.panelWidth}px`;
    this.container.style.minWidth = '180px';

    // ===== 上半部分：NPM 脚本 =====
    const scriptSection = document.createElement('div');
    scriptSection.className = 'script-panel-section script-panel-section-top';

    // 标题栏
    const header = document.createElement('div');
    header.className = 'script-panel-header';

    const title = document.createElement('span');
    title.className = 'script-panel-title';
    title.textContent = 'NPM 脚本';
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'script-panel-close-btn';
    closeBtn.textContent = '✕';
    closeBtn.title = '关闭面板';
    closeBtn.addEventListener('click', () => this.options.onClose());
    header.appendChild(closeBtn);

    scriptSection.appendChild(header);

    // 脚本列表
    this.scriptListEl = document.createElement('div');
    this.scriptListEl.className = 'script-panel-list';
    scriptSection.appendChild(this.scriptListEl);

    this.container.appendChild(scriptSection);

    // ===== 下半部分：Node 版本信息 =====
    const nodeSection = document.createElement('div');
    nodeSection.className = 'script-panel-section script-panel-section-bottom';

    const nodeHeader = document.createElement('div');
    nodeHeader.className = 'script-panel-header';
    const nodeTitle = document.createElement('span');
    nodeTitle.className = 'script-panel-title';
    nodeTitle.textContent = 'Node 版本';
    nodeHeader.appendChild(nodeTitle);
    nodeSection.appendChild(nodeHeader);

    this.nodeInfoEl = document.createElement('div');
    this.nodeInfoEl.className = 'script-panel-list';
    nodeSection.appendChild(this.nodeInfoEl);

    this.container.appendChild(nodeSection);

    parentElement.appendChild(this.container);

    // 绑定分隔条拖拽事件，调整面板宽度
    this.bindDragEvents(parentElement);

    // 加载 Node 版本信息
    this.loadNodeInfo();
  }

  /**
   * 更新脚本列表
   */
  updateScripts(scripts: Record<string, string> | null): void {
    this.scriptListEl.innerHTML = '';

    if (!scripts || Object.keys(scripts).length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'script-panel-empty';
      emptyEl.textContent = '无可用脚本';
      this.scriptListEl.appendChild(emptyEl);
      return;
    }

    for (const [name, command] of Object.entries(scripts)) {
      const item = document.createElement('div');
      item.className = 'script-panel-item';

      // 执行按钮
      const runBtn = document.createElement('button');
      runBtn.className = 'script-panel-run-btn';
      runBtn.textContent = '▶';
      runBtn.title = `执行 npm run ${name}`;
      runBtn.addEventListener('click', () => {
        this.options.onRunScript(`npm run ${name}\r\n`);
      });
      item.appendChild(runBtn);

      // 脚本信息
      const info = document.createElement('div');
      info.className = 'script-panel-info';

      const nameEl = document.createElement('div');
      nameEl.className = 'script-panel-name';
      nameEl.textContent = name;
      nameEl.title = name;
      info.appendChild(nameEl);

      const cmdEl = document.createElement('div');
      cmdEl.className = 'script-panel-command';
      cmdEl.textContent = command;
      cmdEl.title = command;
      info.appendChild(cmdEl);

      item.appendChild(info);

      // 双击整行执行
      item.addEventListener('dblclick', () => {
        this.options.onRunScript(`npm run ${name}\r\n`);
      });

      this.scriptListEl.appendChild(item);
    }
  }

  /**
   * 加载 Node 版本信息和 nvm 列表
   */
  async loadNodeInfo(): Promise<void> {
    this.nodeInfoEl.innerHTML = '<div class="script-panel-empty">加载中...</div>';

    try {
      const info = await window.api.getNodeInfo();

      this.nodeInfoEl.innerHTML = '';

      // 当前 Node 版本
      if (info.nodeVersion) {
        const currentItem = document.createElement('div');
        currentItem.className = 'script-panel-item node-current';

        const icon = document.createElement('span');
        icon.className = 'script-panel-node-icon';
        icon.textContent = '⬢';
        currentItem.appendChild(icon);

        const versionInfo = document.createElement('div');
        versionInfo.className = 'script-panel-info';

        const label = document.createElement('div');
        label.className = 'script-panel-name';
        label.textContent = `当前: ${info.nodeVersion}`;
        versionInfo.appendChild(label);

        currentItem.appendChild(versionInfo);
        this.nodeInfoEl.appendChild(currentItem);
      }

      // nvm 版本列表
      if (info.nvmInstalled && info.nvmList.length > 0) {
        const divider = document.createElement('div');
        divider.className = 'script-panel-divider';
        divider.textContent = 'nvm 可用版本（双击切换）';
        this.nodeInfoEl.appendChild(divider);

        for (const version of info.nvmList) {
          const item = document.createElement('div');
          item.className = 'script-panel-item node-version-item';

          // 当前使用的版本高亮
          const isCurrent = info.nodeVersion && info.nodeVersion.includes(version);
          if (isCurrent) {
            item.classList.add('active');
          }

          const icon = document.createElement('span');
          icon.className = 'script-panel-node-icon';
          icon.textContent = isCurrent ? '✓' : '⬢';
          icon.style.color = isCurrent ? '#4ec9b0' : '#666666';
          item.appendChild(icon);

          const versionEl = document.createElement('div');
          versionEl.className = 'script-panel-info';
          const nameEl = document.createElement('div');
          nameEl.className = 'script-panel-name';
          nameEl.textContent = `v${version}`;
          versionEl.appendChild(nameEl);
          item.appendChild(versionEl);

          // 双击切换版本
          item.addEventListener('dblclick', () => {
            this.options.onRunScript(`nvm use ${version}\r\n`);
            // 延迟刷新版本信息
            setTimeout(() => this.loadNodeInfo(), 2000);
          });

          this.nodeInfoEl.appendChild(item);
        }
      } else if (!info.nvmInstalled) {
        const noNvm = document.createElement('div');
        noNvm.className = 'script-panel-empty';
        noNvm.style.fontSize = '11px';
        noNvm.textContent = 'nvm 未安装';
        this.nodeInfoEl.appendChild(noNvm);
      }
    } catch {
      this.nodeInfoEl.innerHTML = '<div class="script-panel-empty">获取版本信息失败</div>';
    }
  }

  show(): void {
    this.container.style.display = 'flex';
    this.dividerEl.style.display = 'block';
  }
  hide(): void {
    this.container.style.display = 'none';
    this.dividerEl.style.display = 'none';
  }
  isVisible(): boolean { return this.container.style.display !== 'none'; }
  getElement(): HTMLElement { return this.container; }
  destroy(): void {
    this.container.parentElement?.removeChild(this.container);
    this.dividerEl.parentElement?.removeChild(this.dividerEl);
    // 移除全局监听器，避免内存泄漏
    document.removeEventListener('mousemove', this.mouseMoveHandler);
    document.removeEventListener('mouseup', this.mouseUpHandler);
  }

  /**
   * 绑定分隔条拖拽事件，调整面板宽度
   */
  private bindDragEvents(parentElement: HTMLElement): void {
    let isDragging = false;
    let startX = 0;
    let startWidth = 0;

    this.dividerEl.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      isDragging = true;
      startX = e.clientX;
      startWidth = this.panelWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    this.mouseMoveHandler = (e: MouseEvent) => {
      if (!isDragging) return;
      e.preventDefault();
      // divider 在面板左侧：向左拖动鼠标 → 面板变宽
      const delta = startX - e.clientX;
      let newWidth = startWidth + delta;
      // 限制最小/最大宽度
      const parentRect = parentElement.getBoundingClientRect();
      const maxWidth = Math.max(180, parentRect.width - 200); // 至少给终端留 200px
      newWidth = Math.max(180, Math.min(maxWidth, newWidth));
      this.panelWidth = newWidth;
      this.container.style.width = `${newWidth}px`;
      this.container.style.flexShrink = '0';
      // 触发布局变化回调，让终端重新适配尺寸
      window.dispatchEvent(new Event('resize'));
    };

    this.mouseUpHandler = () => {
      if (!isDragging) return;
      isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', this.mouseMoveHandler);
    document.addEventListener('mouseup', this.mouseUpHandler);
  }
}
