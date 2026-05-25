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
  private scriptListEl: HTMLElement;
  private nodeInfoEl: HTMLElement;
  private options: ScriptPanelOptions;

  constructor(parentElement: HTMLElement, options: ScriptPanelOptions) {
    this.options = options;

    // 根容器
    this.container = document.createElement('div');
    this.container.className = 'script-panel';

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

  show(): void { this.container.style.display = 'flex'; }
  hide(): void { this.container.style.display = 'none'; }
  isVisible(): boolean { return this.container.style.display !== 'none'; }
  getElement(): HTMLElement { return this.container; }
  destroy(): void { this.container.parentElement?.removeChild(this.container); }
}
