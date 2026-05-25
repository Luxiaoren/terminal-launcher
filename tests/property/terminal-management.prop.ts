import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { PtyManager, IPtyFactory, IPtyProcess } from '../../src/main/pty-manager';
import { PtyCreateOptions } from '../../src/shared/types';

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
 * 创建 mock pty 工厂（每次 spawn 返回新的 mock 进程）
 */
function createMockFactory(): IPtyFactory {
  return {
    spawn: vi.fn().mockImplementation(() => createMockPtyProcess()),
  };
}

/** 操作类型：创建终端或关闭终端 */
type Operation = { type: 'create' } | { type: 'destroy'; index: number };

/**
 * 属性测试：终端数量上限不变量
 *
 * **Validates: Requirements 3.6**
 *
 * 对于任意序列的终端创建和关闭操作，
 * 系统中活跃的终端实例数量应始终不超过 20 个。
 */
describe('Property 10: 终端数量上限不变量', () => {
  /**
   * 生成任意操作序列的 arbitrary
   * - create：创建一个新终端
   * - destroy：关闭已有终端列表中指定索引的终端
   */
  const operationArb: fc.Arbitrary<Operation> = fc.oneof(
    fc.constant({ type: 'create' } as Operation),
    // index 用于从当前活跃终端列表中选择要关闭的终端
    fc.nat({ max: 99 }).map((index) => ({ type: 'destroy', index } as Operation))
  );

  const defaultOptions: PtyCreateOptions = {
    cwd: 'D:\\Projects\\test',
    shell: 'cmd.exe',
    args: [],
  };

  it('任意创建/关闭操作序列中，活跃终端数量始终不超过 20', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(operationArb, { minLength: 1, maxLength: 50 }),
        async (operations: Operation[]) => {
          const mockFactory = createMockFactory();
          const manager = new PtyManager(mockFactory);

          // 记录当前活跃的终端 ID 列表
          const activeIds: string[] = [];

          for (const op of operations) {
            if (op.type === 'create') {
              try {
                const id = await manager.create(defaultOptions);
                activeIds.push(id);
              } catch {
                // 达到上限时 create 会抛出错误，这是预期行为
              }
            } else {
              // destroy 操作：从活跃列表中选择一个终端关闭
              if (activeIds.length > 0) {
                const idx = op.index % activeIds.length;
                const idToDestroy = activeIds[idx];
                try {
                  await manager.destroy(idToDestroy);
                  activeIds.splice(idx, 1);
                } catch {
                  // 终端可能已被关闭，忽略错误
                }
              }
            }

            // 核心不变量：活跃终端数量始终不超过 20
            expect(manager.getActiveCount()).toBeLessThanOrEqual(20);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
