/**
 * 主工作界面入口
 * 从 URL 参数中获取 workspace folder，初始化所有组件
 */
import '../components/directory-tree.css';
import '../components/terminal-panel.css';
import '../components/tab-bar.css';
import '../components/layout-manager.css';
import '../components/terminal-type-selector.css';
import '../components/script-panel.css';
import { DirectoryTree } from '../components/directory-tree';
import { TerminalPanel } from '../components/terminal-panel';
import { TabBar } from '../components/tab-bar';
import { LayoutManager } from '../components/layout-manager';
import { TerminalTypeSelector } from '../components/terminal-type-selector';
import { ScriptPanel } from '../components/script-panel';
import type { TerminalType } from '../../shared/types';

// 声明 window.api 类型
declare const window: Window & { api: any };

/** TerminalPanel 内部 tabId 到 pty terminalId 的映射 */
const tabToPtyMap = new Map<string, string>();

/** 根据终端类型获取默认 shell 路径 */
function getDefaultShell(type: TerminalType): string {
  switch (type) {
    case 'cmd': return 'cmd.exe';
    case 'powershell': return 'powershell.exe';
    case 'gitbash': return 'C:\\Program Files\\Git\\bin\\bash.exe';
    case 'windowsTerminal': return 'wt.exe';
    default: return 'cmd.exe';
  }
}

/**
 * 从 URL 参数中获取工作区文件夹路径
 */
function getWorkspaceFolder(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('folder');
}

/**
 * 初始化主工作界面
 */
async function init(): Promise<void> {
  const folderPath = getWorkspaceFolder();
  if (!folderPath) {
    document.body.innerHTML = '<div style="color:#ccc;padding:40px;text-align:center;">未指定工作文件夹</div>';
    return;
  }

  const appEl = document.getElementById('app')!;

  // 初始化布局管理器（左右分栏）
  const layoutManager = new LayoutManager(appEl);
  layoutManager.init({ splitRatio: 30, terminalVisible: true });

  // ===== 右侧面板：标签栏 + 终端类型选择 + 终端面板 + 脚本面板 =====
  const rightPanel = layoutManager.getRightPanel();

  // 右侧面板内部用 flex 横向布局：终端区域 | 脚本面板
  rightPanel.style.cssText = 'display:flex; flex-direction:row; min-width:0;';

  // 终端主区域容器（包含工具栏和终端内容）
  const terminalAreaEl = document.createElement('div');
  terminalAreaEl.style.cssText = 'flex:1; display:flex; flex-direction:column; min-width:0; overflow:hidden;';
  rightPanel.appendChild(terminalAreaEl);

  // 顶部工具栏容器（标签栏 + 终端类型选择器）
  const toolbarEl = document.createElement('div');
  toolbarEl.style.cssText = 'display:flex; align-items:center; background:#252526; border-bottom:1px solid #3c3c3c; flex-shrink:0;';
  terminalAreaEl.appendChild(toolbarEl);

  // 标签栏容器
  const tabBarContainer = document.createElement('div');
  tabBarContainer.style.cssText = 'flex:1; overflow:hidden;';
  toolbarEl.appendChild(tabBarContainer);

  // 终端类型选择器容器
  const selectorContainer = document.createElement('div');
  selectorContainer.style.cssText = 'padding:0 8px; flex-shrink:0;';
  toolbarEl.appendChild(selectorContainer);

  // 当前选中的终端类型（用于打开新终端时）
  let currentTerminalType: TerminalType = 'cmd';
  let currentShell = 'cmd.exe';

  // 初始化终端类型选择器
  const terminalTypeSelector = new TerminalTypeSelector(selectorContainer, {
    onTypeSelect: async (type: TerminalType) => {
      currentTerminalType = type;
      // 同步更新 shell 路径
      try {
        const config = await window.api.getConfig();
        currentShell = config.terminalPaths[type] || getDefaultShell(type);
      } catch {
        currentShell = getDefaultShell(type);
      }
    }
  });

  // 初始化终端面板（挂载到终端主区域）
  const terminalPanel = new TerminalPanel(terminalAreaEl);

  // ===== 脚本面板（挂载到右侧面板，终端区域右边） =====
  // 记录每个 tabId 对应的文件夹路径，用于切换标签时更新脚本面板
  const tabToCwdMap = new Map<string, string>();

  const scriptPanel = new ScriptPanel(rightPanel, {
    onRunScript: (command: string) => {
      // 向当前活跃终端写入命令
      const ptyId = terminalPanel.getActivePtyId();
      if (ptyId) {
        // 先发一个空操作（Ctrl+C 清除可能的残留输入），再发命令
        // 用短延迟确保 shell 已就绪
        window.api.writeTerminal(ptyId, '\x03'); // Ctrl+C 清除当前行
        setTimeout(() => {
          window.api.writeTerminal(ptyId, command);
        }, 50);
      }
    },
    onClose: () => {
      scriptPanel.hide();
      // 触发终端尺寸重新适配
      requestAnimationFrame(() => terminalPanel.fitAll());
    },
  });
  // 默认隐藏脚本面板
  scriptPanel.hide();

  // 初始化标签栏
  const tabBar = new TabBar(tabBarContainer, {
    onTabSwitch: (terminalId: string) => {
      // 通过 terminalId 找到对应的 tabId
      for (const [tabId, ptyId] of tabToPtyMap.entries()) {
        if (ptyId === terminalId) {
          terminalPanel.switchTab(tabId);
          // 切换标签时更新脚本面板
          const cwd = tabToCwdMap.get(tabId);
          if (cwd) {
            window.api.readScripts(cwd).then((scripts: Record<string, string> | null) => {
              if (scripts && Object.keys(scripts).length > 0) {
                scriptPanel.updateScripts(scripts);
                scriptPanel.show();
              } else {
                scriptPanel.hide();
              }
              requestAnimationFrame(() => terminalPanel.fitAll());
            }).catch(() => {
              scriptPanel.hide();
              requestAnimationFrame(() => terminalPanel.fitAll());
            });
          }
          break;
        }
      }
    },
    onTabClose: async (terminalId: string) => {
      // 通过 terminalId 找到对应的 tabId 并关闭
      for (const [tabId, ptyId] of tabToPtyMap.entries()) {
        if (ptyId === terminalId) {
          await terminalPanel.closeTab(tabId);
          tabToPtyMap.delete(tabId);
          tabToCwdMap.delete(tabId);
          break;
        }
      }
      // 如果没有标签了，显示引导提示并隐藏脚本面板
      if (tabBar.getTabCount() === 0) {
        layoutManager.setGuideVisible(true);
        scriptPanel.hide();
      }
    }
  });

  // ===== 左侧面板：目录树 =====
  const directoryTree = new DirectoryTree(layoutManager.getLeftPanel());

  // 注册双击文件夹打开终端
  directoryTree.onFolderDoubleClick(async (folderPath: string) => {
    // 直接使用当前选择的终端类型（由 TerminalTypeSelector 控制）
    const shell = currentShell;
    const terminalType = currentTerminalType;

    // 创建终端
    const tabId = await terminalPanel.createTab({
      cwd: folderPath,
      terminalType,
      shell,
    });

    if (tabId) {
      // 隐藏引导提示
      layoutManager.setGuideVisible(false);
      tabBar.createTab(tabId, folderPath, terminalType);
      tabToPtyMap.set(tabId, tabId);
      tabToCwdMap.set(tabId, folderPath);

      // 读取该文件夹的 package.json scripts
      try {
        const scripts = await window.api.readScripts(folderPath);
        if (scripts && Object.keys(scripts).length > 0) {
          scriptPanel.updateScripts(scripts);
          scriptPanel.show();
          // 脚本面板显示后重新适配终端尺寸
          requestAnimationFrame(() => terminalPanel.fitAll());
        } else {
          scriptPanel.hide();
          requestAnimationFrame(() => terminalPanel.fitAll());
        }
      } catch {
        // 读取失败时隐藏脚本面板
        scriptPanel.hide();
      }

      // 递增文件夹使用次数并保存
      usageCount[folderPath] = (usageCount[folderPath] || 0) + 1;
      directoryTree.setUsageCount(usageCount);
      window.api.updateConfig({ folderUsageCount: usageCount }).catch(() => {});
    }
  });

  // 布局变化时适配终端尺寸
  layoutManager.onLayoutChange(() => {
    terminalPanel.fitAll();
  });

  // 加载初始配置
  let usageCount: Record<string, number> = {};
  try {
    const config = await window.api.getConfig();
    currentTerminalType = config.defaultTerminalType || 'cmd';
    currentShell = config.terminalPaths[currentTerminalType] || 'cmd.exe';
    usageCount = config.folderUsageCount || {};
  } catch {
    // 使用默认值
  }

  // 设置使用次数数据给目录树（用于排序）
  directoryTree.setUsageCount(usageCount);

  // 加载目录树
  await directoryTree.setRoot(folderPath);
}

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
