import * as fs from 'fs';
import * as path from 'path';
import { FolderEntry, AccessCheckResult } from '../shared/types';

/**
 * 单层最多返回的文件夹条目数量
 */
const MAX_FOLDER_ENTRIES = 1000;

/**
 * 判断字符是否为 ASCII 字母
 */
function isAsciiLetter(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

/**
 * 文件夹名称排序比较函数
 * 规则：不区分大小写字典序，英文字母优先于中文字符
 *
 * 排序逻辑：
 * 1. 如果两个名称首字符类型相同（都是英文或都是非英文），按 localeCompare 不区分大小写排序
 * 2. 如果首字符类型不同，英文字母开头的排在前面
 */
export function compareFolderNames(a: string, b: string): number {
  const aIsAscii = a.length > 0 && isAsciiLetter(a[0]);
  const bIsAscii = b.length > 0 && isAsciiLetter(b[0]);

  // 英文字母开头的排在中文字符开头的前面
  if (aIsAscii && !bIsAscii) return -1;
  if (!aIsAscii && bIsAscii) return 1;

  // 同类型按不区分大小写字典序排列
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

/**
 * 对话框提供者接口
 * 抽象 Electron dialog 调用，便于测试时 mock
 */
export interface DialogProvider {
  showOpenDialog(options: {
    properties: string[];
    title?: string;
  }): Promise<{ canceled: boolean; filePaths: string[] }>;
}

/**
 * FileSystemService - 文件系统服务
 *
 * 提供文件系统操作的封装，包括：
 * - 读取目录下的子文件夹列表（仅文件夹类型）
 * - 检查路径存在性和读写权限
 * - 打开系统文件夹选择对话框
 */
export class FileSystemService {
  private dialogProvider: DialogProvider;

  /**
   * @param dialogProvider 对话框提供者（可选，默认使用 Electron dialog）
   *                       支持注入以便于测试
   */
  constructor(dialogProvider?: DialogProvider) {
    if (dialogProvider) {
      this.dialogProvider = dialogProvider;
    } else {
      // 延迟加载 electron dialog，避免在测试环境中报错
      this.dialogProvider = {
        showOpenDialog: async (options) => {
          const { dialog, BrowserWindow } = require('electron');
          const win = BrowserWindow.getFocusedWindow();
          if (win) {
            return dialog.showOpenDialog(win, options as any);
          }
          return dialog.showOpenDialog(options as any);
        },
      };
    }
  }

  /**
   * 读取目录下的子文件夹列表
   *
   * - 仅返回文件夹类型条目，不包含文件
   * - 判断每个子文件夹是否可访问（readable）
   * - 判断每个子文件夹是否有子文件夹（hasChildren）
   * - 排序规则：优先按使用次数降序，次数相同按字典序
   * - 单层最多返回 1000 个文件夹条目
   *
   * @param dirPath 目标目录的绝对路径
   * @param usageCount 文件夹使用次数映射（可选，用于按使用频率排序）
   * @returns 文件夹条目列表
   */
  async readSubfolders(dirPath: string, usageCount?: Record<string, number>): Promise<FolderEntry[]> {
    // 读取目录内容，附带文件类型信息
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    // 仅保留文件夹类型条目
    const folderDirents = entries.filter((entry) => entry.isDirectory());

    // 排序：如果有使用次数数据，优先按次数降序；否则按字典序
    const sortedDirents = folderDirents.sort((a, b) => {
      if (usageCount) {
        const fullPathA = path.join(dirPath, a.name);
        const fullPathB = path.join(dirPath, b.name);
        const countA = usageCount[fullPathA] || 0;
        const countB = usageCount[fullPathB] || 0;
        if (countA !== countB) {
          return countB - countA; // 次数多的排前面
        }
      }
      // 次数相同或无使用数据时，按字典序
      return compareFolderNames(a.name, b.name);
    });

    // 截断到最大条目数
    const limitedDirents = sortedDirents.slice(0, MAX_FOLDER_ENTRIES);

    // 构建 FolderEntry 列表，并行检查 accessible 和 hasChildren
    const folderEntries = await Promise.all(
      limitedDirents.map(async (dirent) => {
        const fullPath = path.join(dirPath, dirent.name);
        const accessible = await this.isAccessible(fullPath);
        const hasChildren = accessible ? await this.hasSubfolders(fullPath) : false;

        return {
          name: dirent.name,
          path: fullPath,
          accessible,
          hasChildren,
        } as FolderEntry;
      })
    );

    return folderEntries;
  }

  /**
   * 检查路径的存在性和读写权限
   *
   * @param dirPath 目标路径
   * @returns 包含 exists、readable、writable 的检查结果
   */
  async checkAccess(dirPath: string): Promise<AccessCheckResult> {
    const result: AccessCheckResult = {
      exists: false,
      readable: false,
      writable: false,
    };

    // 检查路径是否存在
    try {
      await fs.promises.access(dirPath, fs.constants.F_OK);
      result.exists = true;
    } catch {
      return result;
    }

    // 检查读取权限
    try {
      await fs.promises.access(dirPath, fs.constants.R_OK);
      result.readable = true;
    } catch {
      // 无读取权限
    }

    // 检查写入权限
    try {
      await fs.promises.access(dirPath, fs.constants.W_OK);
      result.writable = true;
    } catch {
      // 无写入权限
    }

    return result;
  }

  /**
   * 打开系统文件夹选择对话框
   *
   * @returns 用户选择的文件夹路径，取消时返回 null
   */
  async openFolderDialog(): Promise<string | null> {
    const result = await this.dialogProvider.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择文件夹',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  }

  /**
   * 检查路径是否可访问（具有读取权限）
   */
  private async isAccessible(dirPath: string): Promise<boolean> {
    try {
      await fs.promises.access(dirPath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 检查目录下是否存在子文件夹
   */
  private async hasSubfolders(dirPath: string): Promise<boolean> {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      return entries.some((entry) => entry.isDirectory());
    } catch {
      // 读取失败时视为无子文件夹
      return false;
    }
  }
}
