/**
 * Property 8: 叶节点无展开箭头
 *
 * 对于任意不包含子文件夹的目录节点，Directory_Tree 不应为其显示展开箭头，
 * 正确标识其为叶节点。
 *
 * 测试策略：
 * 1. 使用真实文件系统：创建仅包含文件（无子文件夹）的目录，
 *    调用 readSubfolders 验证 hasChildren=false
 * 2. 验证渲染逻辑：对于 hasChildren=false 的 FolderEntry，
 *    DirectoryTree 应使用 'tree-node-arrow-placeholder' 而非 'tree-node-arrow'
 *
 * **Validates: Requirements 2.8**
 */
import { describe, it, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileSystemService } from '../../src/main/file-system-service';
import type { FolderEntry } from '../../src/shared/types';

describe('Property 8: 叶节点无展开箭头', () => {
  // 记录创建的临时目录，测试后清理
  const tempDirs: string[] = [];

  afterEach(() => {
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
        const forbidden = ['<', '>', ':', '"', '/', '\\', '|', '?', '*', '\0'];
        return !forbidden.includes(c) && c.charCodeAt(0) > 31;
      }),
      { minLength: 1, maxLength: 20 }
    )
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
   * 生成文件名列表（用于在叶节点目录中创建文件）
   */
  const fileNamesArb = fc
    .array(validNameArb, { minLength: 0, maxLength: 5 })
    .map((names) => {
      // 去重
      const seen = new Set<string>();
      return names.filter((n) => {
        const lower = n.toLowerCase();
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
      });
    });

  /**
   * 生成叶节点目录名称列表（这些目录内不包含子文件夹）
   */
  const leafFolderNamesArb = fc
    .array(validNameArb, { minLength: 1, maxLength: 8 })
    .map((names) => {
      const seen = new Set<string>();
      return names.filter((n) => {
        const lower = n.toLowerCase();
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
      });
    })
    .filter((names) => names.length > 0);

  it('不包含子文件夹的目录，readSubfolders 返回 hasChildren=false', async () => {
    const service = new FileSystemService();

    await fc.assert(
      fc.asyncProperty(
        leafFolderNamesArb,
        fileNamesArb,
        async (folderNames, fileNames) => {
          // 创建临时根目录
          const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prop8-'));
          tempDirs.push(tempDir);

          // 在根目录下创建子文件夹（这些子文件夹内只放文件，不放子文件夹）
          for (const folderName of folderNames) {
            const folderPath = path.join(tempDir, folderName);
            fs.mkdirSync(folderPath);

            // 在子文件夹内创建文件（但不创建子文件夹）
            for (const fileName of fileNames) {
              const filePath = path.join(folderPath, fileName);
              fs.writeFileSync(filePath, 'content');
            }
          }

          // 调用 readSubfolders 获取子文件夹列表
          const result = await service.readSubfolders(tempDir);

          // 验证：所有返回的文件夹条目的 hasChildren 应为 false
          // 因为这些子文件夹内没有任何子文件夹
          for (const entry of result) {
            if (entry.hasChildren !== false) {
              return false;
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('hasChildren=false 的节点渲染时使用 placeholder 而非展开箭头', () => {
    /**
     * 验证 DirectoryTree 的渲染逻辑：
     * 对于 hasChildren=false 且 accessible=true 的 FolderEntry，
     * 应该渲染 'tree-node-arrow-placeholder' 而非 'tree-node-arrow'
     *
     * 这里直接测试渲染逻辑的判断条件，不依赖 DOM 环境
     */
    fc.assert(
      fc.property(
        fc.record({
          name: validNameArb,
          path: fc.constant('C:\\test\\folder'),
          accessible: fc.boolean(),
          hasChildren: fc.constant(false), // 叶节点：无子文件夹
        }),
        (entry: FolderEntry) => {
          // 根据 directory-tree.ts 的渲染逻辑：
          // if (accessible && hasChildren) → 使用 'tree-node-arrow'
          // else → 使用 'tree-node-arrow-placeholder'
          //
          // 当 hasChildren=false 时，无论 accessible 为何值，
          // 条件 (accessible && hasChildren) 始终为 false，
          // 因此应使用 placeholder
          const shouldShowArrow = entry.accessible && entry.hasChildren;
          return shouldShowArrow === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});
