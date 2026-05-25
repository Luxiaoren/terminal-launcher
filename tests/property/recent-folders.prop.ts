import { describe, it, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigManager } from '../../src/main/config-manager';
import { RecentFolder } from '../../src/shared/types';

/**
 * 属性测试：最近文件夹列表排序与截断
 * 
 * **Validates: Requirements 1.5**
 * 
 * 对于任意最近打开的文件夹列表（无论长度），
 * getRecentFolders() 返回结果应按 lastOpened 时间戳降序排列，
 * 且条目数量不超过 10 个。
 */
describe('Property 1: 最近文件夹列表排序与截断', () => {
  let tempDir: string;

  beforeEach(() => {
    // 创建临时目录用于测试配置存储
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
  });

  afterEach(() => {
    // 清理临时目录
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * 生成任意 RecentFolder 条目的 arbitrary
   */
  const recentFolderArb: fc.Arbitrary<RecentFolder> = fc.record({
    path: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), { minLength: 1, maxLength: 20 }).map(s => `C:\\folders\\${s}`),
    name: fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 1, maxLength: 10 }),
    lastOpened: fc.integer({ min: 1000000000000, max: 2000000000000 }),
  });

  it('返回结果按 lastOpened 降序排列且不超过 10 条', () => {
    fc.assert(
      fc.property(
        fc.array(recentFolderArb, { minLength: 0, maxLength: 30 }),
        (folders: RecentFolder[]) => {
          // 确保路径唯一（去重）
          const uniqueFolders = folders.reduce<RecentFolder[]>((acc, f) => {
            if (!acc.some(existing => existing.path === f.path)) {
              acc.push(f);
            }
            return acc;
          }, []);

          // 写入配置文件，设置 recentFolders
          const configData = {
            defaultTerminalType: 'cmd',
            terminalPaths: {
              cmd: 'cmd.exe',
              powershell: 'powershell.exe',
              gitbash: 'C:\\Program Files\\Git\\bin\\bash.exe',
              windowsTerminal: 'wt.exe',
            },
            recentFolders: uniqueFolders,
            windowState: { x: 100, y: 100, width: 1024, height: 768, isMaximized: false },
            layoutConfig: { splitRatio: 30, terminalVisible: true },
          };

          // 每次迭代使用独立子目录，避免冲突
          const iterDir = fs.mkdtempSync(path.join(tempDir, 'iter-'));
          fs.writeFileSync(
            path.join(iterDir, 'settings.json'),
            JSON.stringify(configData, null, 2),
            'utf-8'
          );

          // 实例化 ConfigManager 并获取结果
          const manager = new ConfigManager(iterDir);
          const result = manager.getRecentFolders();

          // 属性 1：条目数量不超过 10
          if (result.length > 10) {
            return false;
          }

          // 属性 2：按 lastOpened 降序排列
          for (let i = 1; i < result.length; i++) {
            if (result[i].lastOpened > result[i - 1].lastOpened) {
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
