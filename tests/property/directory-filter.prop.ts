/**
 * Property 5: 目录树仅显示文件夹
 *
 * 对于任意目录内容（包含文件和文件夹的混合列表），
 * FileSystemService.readSubfolders() 的输出应仅包含文件夹类型的条目，
 * 不包含任何文件条目。
 *
 * **Validates: Requirements 2.2**
 */
import { describe, it, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileSystemService } from '../../src/main/file-system-service';

describe('Property 5: 目录树仅显示文件夹', () => {
  // 记录创建的临时目录，测试后清理
  const tempDirs: string[] = [];

  afterEach(() => {
    // 清理所有临时目录
    for (const dir of tempDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // 忽略清理失败
      }
    }
    tempDirs.length = 0;
  });

  /**
   * 生成合法的文件/文件夹名称
   * 避免 Windows 文件系统不允许的字符
   */
  const validNameArb = fc
    .stringOf(
      fc.char().filter((c) => {
        // 排除 Windows 文件名非法字符和控制字符
        const forbidden = ['<', '>', ':', '"', '/', '\\', '|', '?', '*', '\0'];
        return !forbidden.includes(c) && c.charCodeAt(0) > 31;
      }),
      { minLength: 1, maxLength: 20 }
    )
    // 排除 Windows 保留名称和以点/空格结尾的名称
    .filter((name) => {
      const upper = name.toUpperCase().replace(/\.[^.]*$/, '');
      const reserved = [
        'CON', 'PRN', 'AUX', 'NUL',
        'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
        'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
      ];
      return (
        !reserved.includes(upper) &&
        !name.endsWith('.') &&
        !name.endsWith(' ') &&
        name.trim().length > 0
      );
    });

  /**
   * 生成文件系统条目描述：{ name, isFolder }
   */
  const entryArb = fc.record({
    name: validNameArb,
    isFolder: fc.boolean(),
  });

  /**
   * 生成包含文件和文件夹的混合列表（至少 1 个条目）
   * 确保名称唯一
   */
  const entriesArb = fc
    .array(entryArb, { minLength: 1, maxLength: 15 })
    .map((entries) => {
      // 去重：保留第一个出现的名称
      const seen = new Set<string>();
      return entries.filter((e) => {
        const lower = e.name.toLowerCase();
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
      });
    })
    .filter((entries) => entries.length > 0);

  it('readSubfolders 返回结果仅包含文件夹，不包含文件', async () => {
    const service = new FileSystemService();

    await fc.assert(
      fc.asyncProperty(entriesArb, async (entries) => {
        // 创建临时目录
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prop5-'));
        tempDirs.push(tempDir);

        // 在临时目录中创建文件和文件夹
        for (const entry of entries) {
          const fullPath = path.join(tempDir, entry.name);
          if (entry.isFolder) {
            fs.mkdirSync(fullPath);
          } else {
            fs.writeFileSync(fullPath, 'test content');
          }
        }

        // 调用 readSubfolders
        const result = await service.readSubfolders(tempDir);

        // 计算预期的文件夹列表
        const expectedFolders = entries
          .filter((e) => e.isFolder)
          .map((e) => e.name);

        // 验证：返回结果数量等于文件夹数量
        if (result.length !== expectedFolders.length) {
          return false;
        }

        // 验证：返回的每个条目名称都在预期文件夹列表中
        for (const folder of result) {
          if (!expectedFolders.includes(folder.name)) {
            return false;
          }
        }

        // 验证：没有文件出现在结果中
        const fileNames = entries
          .filter((e) => !e.isFolder)
          .map((e) => e.name);
        for (const folder of result) {
          if (fileNames.includes(folder.name)) {
            return false;
          }
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
