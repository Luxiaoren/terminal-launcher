import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { PtyManager, IPtyFactory, IPtyProcess } from '../../src/main/pty-manager';
import { PtyCreateOptions } from '../../src/shared/types';

/**
 * 属性测试：异常退出码显示
 *
 * **Validates: Requirements 3.10**
 *
 * 对于任意非零退出码（1-255），终端进程以该退出码退出时，
 * PtyManager 应发出包含该具体退出码数值的 exit 事件，
 * 且终端实例状态更新为 'error'，exitCode 字段记录该退出码。
 */
describe('Property 12: 异常退出码显示', () => {
  /**
   * 创建可控的 mock pty 进程
   * 返回进程对象和触发退出的方法
   */
  function createControllableMockProcess(): {
    process: IPtyProcess;
    triggerExit: (exitCode: number) => void;
  } {
    let exitCallback: ((exitData: { exitCode: number; signal?: number }) => void) | null = null;

    const process: IPtyProcess = {
      pid: Math.floor(Math.random() * 10000) + 1000,
      onData: vi.fn(),
      onExit: (cb) => { exitCallback = cb; },
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(),
    };

    const triggerExit = (exitCode: number) => {
      exitCallback?.({ exitCode });
    };

    return { process, triggerExit };
  }

  /**
   * 创建 mock pty 工厂
   */
  function createMockFactory(process: IPtyProcess): IPtyFactory {
    return {
      spawn: vi.fn().mockReturnValue(process),
    };
  }

  const defaultOptions: PtyCreateOptions = {
    cwd: 'D:\\Projects\\test',
    shell: 'cmd.exe',
    args: [],
  };

  it('非零退出码（1-255）应触发 exit 事件并携带正确退出码', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成 1-255 范围的退出码
        fc.integer({ min: 1, max: 255 }),
        async (exitCode: number) => {
          // 创建可控的 mock 进程
          const { process: mockProcess, triggerExit } = createControllableMockProcess();
          const mockFactory = createMockFactory(mockProcess);
          const manager = new PtyManager(mockFactory);

          // 监听 exit 事件
          let emittedTerminalId: string | null = null;
          let emittedExitCode: number | null = null;
          manager.on('exit', (terminalId: string, code: number) => {
            emittedTerminalId = terminalId;
            emittedExitCode = code;
          });

          // 创建终端
          const terminalId = await manager.create(defaultOptions);

          // 模拟进程以指定退出码退出
          triggerExit(exitCode);

          // 验证 1：exit 事件被触发且携带正确的退出码
          expect(emittedTerminalId).toBe(terminalId);
          expect(emittedExitCode).toBe(exitCode);

          // 验证 2：终端实例状态变为 'error'（非零退出码表示异常退出）
          const instance = manager.getInstance(terminalId);
          expect(instance).toBeDefined();
          expect(instance!.status).toBe('error');

          // 验证 3：终端实例的 exitCode 字段记录了具体退出码数值
          expect(instance!.exitCode).toBe(exitCode);

          // 清理事件监听
          manager.removeAllListeners();
        }
      ),
      { numRuns: 100 }
    );
  });
});
