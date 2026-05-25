import { describe, it, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigManager } from '../../src/main/config-manager';
import { RecentFolder } from '../../src/shared/types';

/**
 * 属性测试：路径存在性批量检查
 *
 * **Validates: Requirements 1.9**
 *
 * 对于任意最近文件夹列表，Welcome_Page 加载时应对每个路径执行存在性检查，
 * 检查结果应准确反映路径的实际存在状态。
 */
describe('Property 4: 路径存在性批量检查', () => {
  let tempDir: string;

  beforeEach(() => {
    // 创建临时目录用于测试
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'path-check-test-'));
  });

  afterEach(() => {
    // 清理临时目录
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('checkRecentFoldersExistence 对每个路径返回准确的存在性状态', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成 0~10 个"存在"的路径数量和 0~10 个"不存在"的路径数量
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 1000000000000, max: 2000000000000 }),
        async (existingCount: number, nonExistingCount: number, baseTimestamp: number) => {
          // 为本次迭代创建独立子目录
          const iterDir = fs.mkdtempSync(path.join(tempDir, 'iter-'));
          const configDir = fs.mkdtempSync(path.join(tempDir, 'config-'));

          // 创建"存在"的文件夹路径
          const existingFolders: RecentFolder[] = [];
          for (let i = 0; i < existingCount; i++) {
            const folderPath = path.join(iterDir, `existing-folder-${i}`);
            fs.mkdirSync(folderPath, { recursive: true });
            existingFolders.push({
              path: folderPath,
              name: `existing-folder-${i}`,
              lastOpened: baseTimestamp + i * 1000,
            });
          }

          // 创建"不存在"的文件夹路径（使用随机后缀确保路径不存在）
          const nonExistingFolders: RecentFolder[] = [];
          for (let i = 0; i < nonExistingCount; i++) {
            const folderPath = path.join(iterDir, `non-existing-${i}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
            nonExistingFolders.push({
              path: folderPath,
              name: `non-existing-${i}`,
              lastOpened: baseTimestamp + (existingCount + i) * 1000,
            });
          }

          // 合并所有文件夹记录
          const allFolders = [...existingFolders, ...nonExistingFolders];

          // 写入配置文件
          const configData = {
            defaultTerminalType: 'cmd',
            terminalPaths: {
              cmd: 'cmd.exe',
              powershell: 'powershell.exe',
              gitbash: 'C:\\Program Files\\Git\\bin\\bash.exe',
              windowsTerminal: 'wt.exe',
            },
            recentFolders: allFolders,
            windowState: { x: 100, y: 100, width: 1024, height: 768, isMaximized: false },
            layoutConfig: { splitRatio: 30, terminalVisible: true },
          };

          fs.writeFileSync(
            path.join(configDir, 'settings.json'),
            JSON.stringify(configData, null, 2),
            'utf-8'
          );

          // 实例化 ConfigManager 并执行批量检查
          const manager = new ConfigManager(configDir);
          const results = await manager.checkRecentFoldersExistence();

          // 属性 1：返回结果长度等于输入列表长度（受 10 条上限约束）
          const expectedLength = Math.min(allFolders.length, 10);
          if (results.length !== expectedLength) {
            return false;
          }

          // 属性 2：每个路径的 exists 字段准确反映实际存在状态
          for (const result of results) {
            const actuallyExists = fs.existsSync(result.path);
            if (result.exists !== actuallyExists) {
              return false;
            }
          }

          // 属性 3：所有"存在"的路径应标记为 exists: true
          for (const folder of existingFolders) {
            const found = results.find(r => r.path === folder.path);
            if (found && found.exists !== true) {
              return false;
            }
          }

          // 属性 4：所有"不存在"的路径应标记为 exists: false
          for (const folder of nonExistingFolders) {
            const found = results.find(r => r.path === folder.path);
            if (found && found.exists !== false) {
              return false;
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
