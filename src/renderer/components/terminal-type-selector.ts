/**
 * TerminalTypeSelector 终端类型选择组件
 * 提供终端类型下拉菜单和设置面板
 * 需求: 4.1, 4.2, 4.3, 4.5, 4.6
 */

import type { TerminalType, TerminalPaths, AppConfig } from '../../shared/types';

/** 声明 window.api 类型 */
declare const window: Window & {
  api: {
    getConfig(): Promise<AppConfig>;
    updateConfig(partial: Partial<AppConfig>): Promise<void>;
    checkAccess(dirPath: string): Promise<{ exists: boolean; readable: boolean }>;
  };
};

/** 终端类型可用性信息 */
export interface TerminalTypeAvailability {
  type: TerminalType;
  available: boolean;
  reason?: string;
}

/** 终端类型显示信息 */
interface TerminalTypeInfo {
  type: TerminalType;
  label: string;
  icon: string;
}

/** 组件事件回调 */
export interface TerminalTypeSelectorEvents {
  /** 用户选择终端类型时触发 */
  onTypeSelect?: (type: TerminalType) => void;
}

/** 所有支持的终端类型信息 */
const TERMINAL_TYPES: TerminalTypeInfo[] = [
  { type: 'cmd', label: 'CMD', icon: '⌘' },
  { type: 'powershell', label: 'PowerShell', icon: '⚡' },
  { type: 'gitbash', label: 'Git Bash', icon: '🐙' },
  { type: 'windowsTerminal', label: 'Windows Terminal', icon: '▣' },
];

/**
 * TerminalTypeSelector 终端类型选择组件
 * 包含下拉菜单（选择终端类型）和设置面板（配置路径和默认类型）
 */
export class TerminalTypeSelector {
  /** 组件根容器 */
  private container: HTMLElement;
  /** 触发按钮 */
  private triggerEl: HTMLElement;
  /** 下拉菜单 */
  private dropdownEl: HTMLElement;
  /** 箭头图标 */
  private arrowEl: HTMLElement;
  /** 设置面板遮罩层 */
  private settingsOverlay: HTMLElement;
  /** 事件回调 */
  private events: TerminalTypeSelectorEvents = {};
  /** 各终端类型可用性状态 */
  private availability: Map<TerminalType, TerminalTypeAvailability> = new Map();
  /** 当前默认终端类型 */
  private defaultType: TerminalType = 'cmd';
  /** 当前终端路径配置 */
  private terminalPaths: TerminalPaths = {
    cmd: 'cmd.exe',
    powershell: 'powershell.exe',
    gitbash: '',
    windowsTerminal: 'wt.exe',
  };
  /** 下拉菜单是否打开 */
  private isDropdownOpen: boolean = false;

  constructor(parentElement: HTMLElement, events?: TerminalTypeSelectorEvents) {
    if (events) {
      this.events = events;
    }

    // 创建组件根容器
    this.container = document.createElement('div');
    this.container.className = 'terminal-type-selector';

    // 创建触发按钮
    this.triggerEl = document.createElement('div');
    this.triggerEl.className = 'terminal-type-selector-trigger';
    this.triggerEl.addEventListener('click', () => this.toggleDropdown());

    const triggerIcon = document.createElement('span');
    triggerIcon.className = 'terminal-type-selector-trigger-icon';
    triggerIcon.textContent = '⌘';
    this.triggerEl.appendChild(triggerIcon);

    const triggerLabel = document.createElement('span');
    triggerLabel.className = 'terminal-type-selector-trigger-label';
    triggerLabel.textContent = 'CMD';
    this.triggerEl.appendChild(triggerLabel);

    this.arrowEl = document.createElement('span');
    this.arrowEl.className = 'terminal-type-selector-trigger-arrow';
    this.arrowEl.textContent = '▾';
    this.triggerEl.appendChild(this.arrowEl);

    this.container.appendChild(this.triggerEl);

    // 创建下拉菜单
    this.dropdownEl = document.createElement('div');
    this.dropdownEl.className = 'terminal-type-dropdown';
    this.container.appendChild(this.dropdownEl);

    // 创建设置面板遮罩层
    this.settingsOverlay = this.createSettingsOverlay();
    document.body.appendChild(this.settingsOverlay);

    // 点击外部关闭下拉菜单
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target as Node)) {
        this.closeDropdown();
      }
    });

    parentElement.appendChild(this.container);

    // 初始化：加载配置和可用性
    this.loadConfig();
  }

  /**
   * 设置各终端类型的可用性状态
   * @param availabilityList 可用性列表
   */
  setAvailability(availabilityList: TerminalTypeAvailability[]): void {
    this.availability.clear();
    for (const item of availabilityList) {
      this.availability.set(item.type, item);
    }
    this.renderDropdownItems();
  }

  /**
   * 获取当前选中的默认终端类型
   */
  getDefaultType(): TerminalType {
    return this.defaultType;
  }

  /**
   * 获取组件根元素
   */
  getElement(): HTMLElement {
    return this.container;
  }

  /**
   * 刷新配置（从主进程重新加载）
   */
  async refreshConfig(): Promise<void> {
    await this.loadConfig();
  }

  // ===== 私有方法 =====

  /**
   * 从主进程加载配置
   */
  private async loadConfig(): Promise<void> {
    try {
      const config = await window.api.getConfig();
      this.defaultType = config.defaultTerminalType || 'cmd';
      this.terminalPaths = { ...config.terminalPaths };
      this.updateTriggerDisplay();
      this.renderDropdownItems();
    } catch (err) {
      console.warn('加载终端类型配置失败:', err);
    }
  }

  /**
   * 更新触发按钮的显示内容（显示当前默认类型）
   */
  private updateTriggerDisplay(): void {
    const typeInfo = TERMINAL_TYPES.find(t => t.type === this.defaultType);
    if (!typeInfo) return;

    const iconEl = this.triggerEl.querySelector('.terminal-type-selector-trigger-icon');
    const labelEl = this.triggerEl.querySelector('.terminal-type-selector-trigger-label');
    if (iconEl) iconEl.textContent = typeInfo.icon;
    if (labelEl) labelEl.textContent = typeInfo.label;
  }

  /**
   * 切换下拉菜单显示/隐藏
   */
  private toggleDropdown(): void {
    if (this.isDropdownOpen) {
      this.closeDropdown();
    } else {
      this.openDropdown();
    }
  }

  /**
   * 打开下拉菜单
   */
  private openDropdown(): void {
    this.isDropdownOpen = true;
    this.dropdownEl.classList.add('visible');
    this.arrowEl.classList.add('open');
    this.renderDropdownItems();
  }

  /**
   * 关闭下拉菜单
   */
  private closeDropdown(): void {
    this.isDropdownOpen = false;
    this.dropdownEl.classList.remove('visible');
    this.arrowEl.classList.remove('open');
  }

  /**
   * 渲染下拉菜单项
   */
  private renderDropdownItems(): void {
    this.dropdownEl.innerHTML = '';

    // 渲染各终端类型选项
    for (const typeInfo of TERMINAL_TYPES) {
      const avail = this.availability.get(typeInfo.type);
      const isAvailable = avail ? avail.available : true; // 默认可用（未检测时）

      const item = document.createElement('div');
      item.className = 'terminal-type-dropdown-item';
      if (!isAvailable) {
        item.classList.add('disabled');
      }

      // 图标
      const iconEl = document.createElement('span');
      iconEl.className = 'terminal-type-dropdown-item-icon';
      iconEl.textContent = typeInfo.icon;
      item.appendChild(iconEl);

      // 名称
      const nameEl = document.createElement('span');
      nameEl.className = 'terminal-type-dropdown-item-name';
      nameEl.textContent = typeInfo.label;
      item.appendChild(nameEl);

      // 不可用标识
      if (!isAvailable) {
        const badge = document.createElement('span');
        badge.className = 'terminal-type-dropdown-item-badge';
        badge.textContent = '不可用';
        badge.title = avail?.reason || '终端不可用';
        item.appendChild(badge);
      }

      // 点击事件：仅可用类型可选择
      if (isAvailable) {
        item.addEventListener('click', () => {
          this.handleTypeSelect(typeInfo.type);
        });
      }

      this.dropdownEl.appendChild(item);
    }

    // 分隔线
    const divider = document.createElement('div');
    divider.className = 'terminal-type-dropdown-divider';
    this.dropdownEl.appendChild(divider);

    // 设置入口
    const settingsItem = document.createElement('div');
    settingsItem.className = 'terminal-type-dropdown-settings';
    settingsItem.textContent = '⚙ 终端设置...';
    settingsItem.addEventListener('click', () => {
      this.closeDropdown();
      this.openSettings();
    });
    this.dropdownEl.appendChild(settingsItem);
  }

  /**
   * 处理终端类型选择
   */
  private handleTypeSelect(type: TerminalType): void {
    this.defaultType = type;
    this.updateTriggerDisplay();
    this.closeDropdown();
    // 持久化保存用户选择的终端类型
    window.api.updateConfig({ defaultTerminalType: type }).catch(() => {});
    if (this.events.onTypeSelect) {
      this.events.onTypeSelect(type);
    }
  }

  /**
   * 创建设置面板遮罩层
   */
  private createSettingsOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'terminal-type-settings-overlay';

    // 点击遮罩层关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.closeSettings();
      }
    });

    return overlay;
  }

  /**
   * 打开设置面板
   */
  private openSettings(): void {
    // 每次打开时重新构建面板内容（确保数据最新）
    this.settingsOverlay.innerHTML = '';
    const panel = this.buildSettingsPanel();
    this.settingsOverlay.appendChild(panel);
    this.settingsOverlay.classList.add('visible');
  }

  /**
   * 关闭设置面板
   */
  private closeSettings(): void {
    this.settingsOverlay.classList.remove('visible');
  }

  /**
   * 构建设置面板 DOM
   */
  private buildSettingsPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'terminal-type-settings-panel';

    // 头部
    const header = document.createElement('div');
    header.className = 'terminal-type-settings-header';

    const title = document.createElement('span');
    title.className = 'terminal-type-settings-title';
    title.textContent = '终端设置';
    header.appendChild(title);

    const closeBtn = document.createElement('span');
    closeBtn.className = 'terminal-type-settings-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => this.closeSettings());
    header.appendChild(closeBtn);

    panel.appendChild(header);

    // 内容区域
    const body = document.createElement('div');
    body.className = 'terminal-type-settings-body';

    // 默认终端类型选择
    const defaultSection = document.createElement('div');
    defaultSection.className = 'terminal-type-settings-section';

    const defaultTitle = document.createElement('div');
    defaultTitle.className = 'terminal-type-settings-section-title';
    defaultTitle.textContent = '默认终端类型';
    defaultSection.appendChild(defaultTitle);

    const defaultSelect = document.createElement('select');
    defaultSelect.className = 'terminal-type-settings-default-select';
    for (const typeInfo of TERMINAL_TYPES) {
      const option = document.createElement('option');
      option.value = typeInfo.type;
      option.textContent = `${typeInfo.icon} ${typeInfo.label}`;
      if (typeInfo.type === this.defaultType) {
        option.selected = true;
      }
      defaultSelect.appendChild(option);
    }
    defaultSection.appendChild(defaultSelect);
    body.appendChild(defaultSection);

    // 各终端类型路径配置
    const pathsSection = document.createElement('div');
    pathsSection.className = 'terminal-type-settings-section';

    const pathsTitle = document.createElement('div');
    pathsTitle.className = 'terminal-type-settings-section-title';
    pathsTitle.textContent = '可执行文件路径';
    pathsSection.appendChild(pathsTitle);

    // 用于收集各路径输入框引用和验证状态
    const pathInputs: Map<TerminalType, HTMLInputElement> = new Map();
    const pathStatuses: Map<TerminalType, HTMLElement> = new Map();

    for (const typeInfo of TERMINAL_TYPES) {
      const pathItem = document.createElement('div');
      pathItem.className = 'terminal-type-settings-path-item';

      // 标签
      const label = document.createElement('div');
      label.className = 'terminal-type-settings-path-label';

      const labelIcon = document.createElement('span');
      labelIcon.className = 'terminal-type-settings-path-label-icon';
      labelIcon.textContent = typeInfo.icon;
      label.appendChild(labelIcon);

      const labelText = document.createElement('span');
      labelText.textContent = typeInfo.label;
      label.appendChild(labelText);

      pathItem.appendChild(label);

      // 输入行
      const inputRow = document.createElement('div');
      inputRow.className = 'terminal-type-settings-path-input-row';

      const input = document.createElement('input');
      input.className = 'terminal-type-settings-path-input';
      input.type = 'text';
      input.placeholder = `输入 ${typeInfo.label} 可执行文件路径`;
      input.value = this.terminalPaths[typeInfo.type] || '';
      inputRow.appendChild(input);

      pathItem.appendChild(inputRow);

      // 验证状态提示
      const status = document.createElement('div');
      status.className = 'terminal-type-settings-path-status';
      pathItem.appendChild(status);

      pathInputs.set(typeInfo.type, input);
      pathStatuses.set(typeInfo.type, status);

      pathsSection.appendChild(pathItem);
    }

    body.appendChild(pathsSection);
    panel.appendChild(body);

    // 底部按钮
    const footer = document.createElement('div');
    footer.className = 'terminal-type-settings-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'terminal-type-settings-btn terminal-type-settings-btn-cancel';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => this.closeSettings());
    footer.appendChild(cancelBtn);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'terminal-type-settings-btn terminal-type-settings-btn-save';
    saveBtn.textContent = '保存';
    saveBtn.addEventListener('click', async () => {
      await this.handleSave(defaultSelect, pathInputs, pathStatuses, saveBtn);
    });
    footer.appendChild(saveBtn);

    panel.appendChild(footer);

    return panel;
  }

  /**
   * 处理保存操作
   * 验证所有路径后保存配置
   */
  private async handleSave(
    defaultSelect: HTMLSelectElement,
    pathInputs: Map<TerminalType, HTMLInputElement>,
    pathStatuses: Map<TerminalType, HTMLElement>,
    saveBtn: HTMLButtonElement
  ): Promise<void> {
    // 禁用保存按钮，防止重复点击
    saveBtn.disabled = true;
    saveBtn.textContent = '验证中...';

    let hasInvalid = false;

    // 逐个验证路径
    for (const typeInfo of TERMINAL_TYPES) {
      const input = pathInputs.get(typeInfo.type)!;
      const status = pathStatuses.get(typeInfo.type)!;
      const pathValue = input.value.trim();

      // 清除之前的状态
      input.classList.remove('invalid', 'valid');
      status.classList.remove('error', 'success');
      status.textContent = '';

      // 空路径跳过验证（使用系统默认）
      if (!pathValue) {
        continue;
      }

      // 验证路径是否存在且可执行
      const isValid = await this.validatePath(pathValue);
      if (isValid) {
        input.classList.add('valid');
        status.classList.add('success');
        status.textContent = '✓ 路径有效';
      } else {
        input.classList.add('invalid');
        status.classList.add('error');
        status.textContent = '✗ 路径不存在或不可执行';
        hasInvalid = true;
      }
    }

    // 如果有无效路径，阻止保存
    if (hasInvalid) {
      saveBtn.disabled = false;
      saveBtn.textContent = '保存';
      return;
    }

    // 收集配置数据
    const newDefaultType = defaultSelect.value as TerminalType;
    const newPaths: TerminalPaths = {
      cmd: pathInputs.get('cmd')!.value.trim() || 'cmd.exe',
      powershell: pathInputs.get('powershell')!.value.trim() || 'powershell.exe',
      gitbash: pathInputs.get('gitbash')!.value.trim() || '',
      windowsTerminal: pathInputs.get('windowsTerminal')!.value.trim() || 'wt.exe',
    };

    // 保存到配置
    try {
      await window.api.updateConfig({
        defaultTerminalType: newDefaultType,
        terminalPaths: newPaths,
      });

      // 更新本地状态
      this.defaultType = newDefaultType;
      this.terminalPaths = newPaths;
      this.updateTriggerDisplay();

      // 关闭设置面板
      this.closeSettings();
    } catch (err) {
      // 保存失败提示
      const errorMsg = (err as Error).message || '未知错误';
      // 在面板中显示错误（不关闭面板，保留用户修改内容以便重试）
      const footer = saveBtn.parentElement;
      if (footer) {
        let errorEl = footer.querySelector('.settings-save-error') as HTMLElement;
        if (!errorEl) {
          errorEl = document.createElement('div');
          errorEl.className = 'settings-save-error';
          errorEl.style.cssText = 'color: #f44747; font-size: 11px; flex: 1;';
          footer.insertBefore(errorEl, footer.firstChild);
        }
        errorEl.textContent = `保存失败: ${errorMsg}`;
      }
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = '保存';
    }
  }

  /**
   * 验证可执行文件路径是否存在且可执行
   * @param filePath 文件路径
   * @returns 是否有效
   */
  private async validatePath(filePath: string): Promise<boolean> {
    try {
      const result = await window.api.checkAccess(filePath);
      return result.exists && result.readable;
    } catch {
      return false;
    }
  }
}
