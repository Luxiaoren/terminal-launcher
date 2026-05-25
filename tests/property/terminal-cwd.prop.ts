import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { PtyManager, IPtyFactory, IPtyProcess } from '../../src/main/pty-manager';
import { PtyCreateOptions } from '../../src/shared/types';

/**
 * 属性测试：终端创建工作目录正确
 *
 * **Validates: Requirements 3.1**
 *
 * 对于任意有效的文件夹路径，通过 PtyManager.create 创建终端时，
 * 新终端实例的工作目录（cwd）应等于该文件夹的绝对路径。
 */
describe('Property 9: 终端创建工作目录正确', () => {
  /**
   * 创建 mock pty 进程
   */
  function createMockPtyProcess(): IPtyProcess {
    return {
      pid: Math.floor(Math.random() * 10000) + 1000,
      onData: vi.fn(),
      onExit: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
    };
  }

  /**
   * 创建 mock pty 工厂
   */
  function createMockFactory(): IPtyFactory {
    return {
      spawn: vi.fn().mockImplementation(() => createMockPtyProcess()),
    };
  }

  /**
   * 生成 Windows 风格的绝对路径 arbitrary
   * 格式如：D:\folder\subfolder
   */
  const windowsAbsolutePathArb: fc.Arbitrary<string> = fc.tuple(
    // 盘符：A-Z
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
    // 路径段：1-5 个文件夹名
    fc.array(
      fc.stringOf(
        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')),
        { minLength: 1, maxLength: 15 }
      ),
      { minLength: 1, maxLength: 5 }
    )
  ).map(([drive, segments]) => `${drive}:\\${segments.join('\\')}`);

  it('创建终端后 getInstance().cwd 应等于传入的 cwd', async () => {
    await fc.assert(
      fc.asyncProperty(
        windowsAbsolutePathArb,
        async (cwdPath: string) => {
          // 每次迭代创建新的 manager 实例
          const mockFactory = createMockFactory();
          const manager = new PtyManager(mockFactory);

          const options: PtyCreateOptions = {
            cwd: cwdPath,
            shell: 'cmd.exe',
            args: [],
          };

          // 创建终端
          const terminalId = await manager.create(options);

          // 获取终端实例
          const instance = manager.getInstance(terminalId);

          // 验证：终端实例存在
          expect(instance).toBeDefined();

          // 验证：cwd 等于传入的绝对路径
          expect(instance!.cwd).toBe(cwdPath);

          // 清理
          await manager.destroy(terminalId);
        }
      ),
      { numRuns: 100 }
    );
  });
});
