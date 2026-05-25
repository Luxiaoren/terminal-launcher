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
 * 创建 mock pty 工厂，记录所有创建的进程实例
 */
function createMockFactory(): { factory: IPtyFactory; processes: IPtyProcess[] } {
  const processes: IPtyProcess[] = [];
  const factory: IPtyFactory = {
    spawn: vi.fn().mockImplementation(() => {
      const proc = createMockPtyProcess();
      processes.push(proc);
      return proc;
    }),
  };
  return { factory, processes };
}

const defaultOptions: PtyCreateOptions = {
  cwd: 'D:\\Projects\\test',
  shell: 'cmd.exe',
  args: [],
};

/**
 * 属性测试：终端关闭释放资源
 *
 * **Validates: Requirements 3.8**
 *
 * 对于任意活跃的终端实例，执行关闭操作后：
 * 1. 对应的 node-pty 进程应被终止（kill() 被调用）
 * 2. 终端实例从管理列表中移除（getInstance 返回 undefined）
 * 3. 活跃终端数量相应减少
 */
describe('Property 11: 终端关闭释放资源', () => {
  it('创建后销毁的终端，kill 被调用且实例从管理列表移除，activeCount 减少', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成 1-15 个终端的创建数量
        fc.integer({ min: 1, max: 15 }),
        // 生成要销毁的终端索引序列（相对于已创建列表）
        fc.array(fc.nat({ max: 99 }), { minLength: 1, maxLength: 15 }),
        async (createCount: number, destroyIndices: number[]) => {
          const { factory, processes } = createMockFactory();
          const manager = new PtyManager(factory);

          // 创建指定数量的终端
          const createdIds: string[] = [];
          for (let i = 0; i < createCount; i++) {
            const id = await manager.create(defaultOptions);
            createdIds.push(id);
          }

          // 验证初始状态
          expect(manager.getActiveCount()).toBe(createCount);

          // 逐个销毁终端，验证每次销毁后的状态
          const destroyedSet = new Set<number>();

          for (const rawIdx of destroyIndices) {
            // 选择一个尚未销毁的终端
            const remainingIndices = createdIds
              .map((_, i) => i)
              .filter((i) => !destroyedSet.has(i));

            if (remainingIndices.length === 0) break;

            const targetIdx = remainingIndices[rawIdx % remainingIndices.length];
            const targetId = createdIds[targetIdx];
            const targetProcess = processes[targetIdx];

            const countBefore = manager.getActiveCount();

            // 执行销毁操作
            await manager.destroy(targetId);
            destroyedSet.add(targetIdx);

            // 验证 1: kill() 被调用
            expect(targetProcess.kill).toHaveBeenCalled();

            // 验证 2: getInstance 返回 undefined
            expect(manager.getInstance(targetId)).toBeUndefined();

            // 验证 3: activeCount 减少 1
            expect(manager.getActiveCount()).toBe(countBefore - 1);
          }

          // 最终验证：已销毁的终端数量 + 剩余活跃数量 = 初始创建数量
          expect(manager.getActiveCount()).toBe(createCount - destroyedSet.size);
        }
      ),
      { numRuns: 100 }
    );
  });
});
