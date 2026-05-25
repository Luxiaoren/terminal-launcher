/**
 * WelcomePage 欢迎页面逻辑
 * 实现打开文件夹、最近文件夹列表渲染、路径存在性检查等功能
 */
import './welcome.css';

// 类型声明：window.api 由 preload 脚本通过 contextBridge 注入
// ElectronAPI 接口定义在 src/shared/types.ts 中
interface WelcomePageAPI {
  openFolderDialog(): Promise<string | null>;
  checkAccess(dirPath: string): Promise<{ exists: boolean; readable: boolean; writable: boolean }>;
  getRecentFolders(): Promise<Array<{ path: string; name: string; lastOpened: number }>>;
  addRecentFolder(path: string): Promise<void>;
}

declare const window: Window & {
  api: WelcomePageAPI;
};

/** 带可访问状态的最近文件夹条目 */
interface RecentFolderWithStatus {
  path: string;
  name: string;
  lastOpened: number;
  accessible: boolean;
}

/**
 * 显示错误提示 Toast
 * @param message 提示信息
 * @param duration 显示时长（毫秒），默认 3000
 */
function showToast(message: string, duration: number = 3000): void {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('visible');

  setTimeout(() => {
    toast.classList.remove('visible');
  }, duration);
}

/**
 * 渲染最近文件夹列表
 * @param folders 带状态的文件夹列表
 */
function renderRecentList(folders: RecentFolderWithStatus[]): void {
  const listEl = document.getElementById('recentList');
  if (!listEl) return;

  // 清空列表
  listEl.innerHTML = '';

  // 无记录时显示空状态
  if (folders.length === 0) {
    const emptyEl = document.createElement('li');
    emptyEl.className = 'empty-state';
    emptyEl.textContent = '暂无最近打开的文件夹';
    listEl.appendChild(emptyEl);
    return;
  }

  // 渲染每个文件夹条目
  for (const folder of folders) {
    const itemEl = document.createElement('li');
    itemEl.className = 'recent-item';

    // 不可访问的路径添加禁用样式
    if (!folder.accessible) {
      itemEl.classList.add('disabled');
    }

    itemEl.innerHTML = `
      <span class="folder-icon">📁</span>
      <div class="folder-info">
        <span class="folder-name">${escapeHtml(folder.name)}</span>
        <span class="folder-path">${escapeHtml(folder.path)}</span>
      </div>
    `;

    // 仅可访问的文件夹可点击
    if (folder.accessible) {
      itemEl.addEventListener('click', () => {
        handleSelectFolder(folder.path);
      });
    }

    listEl.appendChild(itemEl);
  }
}

/**
 * HTML 转义，防止 XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 加载最近文件夹列表并检查每个路径的存在性
 */
async function loadRecentFolders(): Promise<void> {
  try {
    // 获取最近文件夹列表（已按时间降序排列，最多 10 条）
    const recentFolders = await window.api.getRecentFolders();

    // 对每个路径执行存在性检查
    const foldersWithStatus: RecentFolderWithStatus[] = await Promise.all(
      recentFolders.map(async (folder) => {
        try {
          const accessResult = await window.api.checkAccess(folder.path);
          return {
            path: folder.path,
            name: folder.name,
            lastOpened: folder.lastOpened,
            accessible: accessResult.exists && accessResult.readable,
          };
        } catch {
          // 检查失败视为不可访问
          return {
            path: folder.path,
            name: folder.name,
            lastOpened: folder.lastOpened,
            accessible: false,
          };
        }
      })
    );

    renderRecentList(foldersWithStatus);
  } catch (error) {
    // 加载失败时显示空状态
    const listEl = document.getElementById('recentList');
    if (listEl) {
      listEl.innerHTML = '<li class="empty-state">加载最近文件夹列表失败</li>';
    }
  }
}

/**
 * 处理文件夹选择（来自对话框或最近列表点击）
 * 验证权限后切换到主工作界面
 * @param folderPath 选中的文件夹路径
 */
async function handleSelectFolder(folderPath: string): Promise<void> {
  try {
    // 检查文件夹访问权限
    const accessResult = await window.api.checkAccess(folderPath);

    if (!accessResult.exists) {
      showToast(`文件夹不存在: ${folderPath}`);
      return;
    }

    if (!accessResult.readable) {
      showToast(`权限不足，无法访问文件夹: ${folderPath}`);
      return;
    }

    // 添加到最近打开列表
    await window.api.addRecentFolder(folderPath);

    // 切换到主工作界面
    window.location.href = `./workspace.html?folder=${encodeURIComponent(folderPath)}`;
  } catch (error) {
    showToast('打开文件夹时发生错误，请重试');
  }
}

/**
 * 处理"打开文件夹"按钮点击
 */
async function handleOpenFolderClick(): Promise<void> {
  const btn = document.getElementById('openFolderBtn') as HTMLButtonElement;
  if (!btn) return;

  // 禁用按钮防止重复点击
  btn.disabled = true;

  try {
    // 调用系统文件夹选择对话框
    const selectedPath = await window.api.openFolderDialog();

    // 用户取消对话框，保持在欢迎页
    if (selectedPath === null) {
      return;
    }

    // 选择了文件夹，验证并切换
    await handleSelectFolder(selectedPath);
  } catch (error) {
    showToast('打开文件夹对话框时发生错误');
  } finally {
    // 恢复按钮状态
    btn.disabled = false;
  }
}

/**
 * 页面初始化
 */
function init(): void {
  // 绑定"打开文件夹"按钮事件
  const openFolderBtn = document.getElementById('openFolderBtn');
  if (openFolderBtn) {
    openFolderBtn.addEventListener('click', handleOpenFolderClick);
  }

  // 加载最近文件夹列表
  loadRecentFolders();
}

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
