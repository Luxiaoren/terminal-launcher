import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PtyManager, IPtyFactory, IPtyProcess } from '../../src/main/pty-manager';
import { PtyCreateOptions } from '../../src/shared/types';

/**
 * 创建 mock pty 进程
 */
function createMockPtyProcess(overrides?: Partial<IPtyProcess>): IPtyProcess {
  let dataCallback: ((data: string) => void) | null = null;
  let exitCallback: ((exitData: { exitCode: number; signal?: number }) => void) | null = null;

  const mockProcess: IPtyProcess = {
    pid: Math.floor(Math.random() * 10000) + 1000,
    onData: (cb) => { dataCallback = cb; },
    onExit: (cb) => { exitCallback = cb; },
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    ...overrides,
  };

  // 暴露触发回调的方法（通过类型断言）
  (mockProcess as any)._emitData = (data: string) => dataCallback?.(data);
  (mockProcess as any)._emitExit = (exitCode: number, signal?: number) =>
    exitCallback?.({ exitCode, signal });

  return mockProcess;
}

/**
 * 创建 mock pty 工厂
 */
function createMockFactory(mockProcess?: IPtyProcess): IPtyFactory {
  const process = mockProcess || createMockPtyProcess();
  return {
    spawn: vi.fn().mockReturnValue(process),
  };
}

describe('PtyManager', () => {
  let manager: PtyManager;
  let mockProcess: IPtyProcess;
  let mockFactory: IPtyFactory;

  const defaultOptions: PtyCreateOptions = {
    cwd: 'D:\\Projects\\test',
    shell: 'cmd.exe',
    args: [],
  };

  beforeEach(() => {
    mockProcess = createMockPtyProcess();
    mockFactory = createMockFactory(mockProcess);
    manager = new PtyManager(mockFactory);
  });

  describe('create', () => {
    it('应成功创建终端并返回 UUID 格式的 terminalId', async () => {
      const terminalId = await manager.create(defaultOptions);

      expect(terminalId).toBeDefined();
      expect(typeof terminalId).toBe('string');
      // UUID 格式验证
      expect(terminalId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('应使用正确的参数调用 pty 工厂', async () => {
      await manager.create(defaultOptions, 'powershell');

      expect(mockFactory.spawn).toHaveBeenCalledWith(
        'cmd.exe',
        [],
        expect.objectContaining({
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd: 'D:\\Projects\\test',
        })
      );
    });

    it('应正确记录终端实例信息', async () => {
      const terminalId = await manager.create(defaultOptions, 'powershell');
      const instance = manager.getInstance(terminalId);

      expect(instance).toBeDefined();
      expect(instance!.cwd).toBe('D:\\Projects\\test');
      expect(instance!.terminalType).toBe('powershell');
      expect(instance!.status).toBe('running');
      expect(instance!.pid).toBe(mockProcess.pid);
    });

    it('默认终端类型应为 cmd', async () => {
      const terminalId = await manager.create(defaultOptions);
      const instance = manager.getInstance(terminalId);

      expect(instance!.terminalType).toBe('cmd');
    });

    it('终端数量达到上限时应抛出错误', async () => {
      // 创建 20 个终端
      for (let i = 0; i < 20; i++) {
        // 每次创建新的 mock 进程
        const process = createMockPtyProcess();
        (mockFactory.spawn as any).mockReturnValue(process);
        await manager.create(defaultOptions);
      }

      // 第 21 个应抛出错误
      await expect(manager.create(defaultOptions)).rejects.toThrow(
        '终端数量已达上限（最多 20 个），无法创建新终端'
      );
    });

    it('活跃终端数量应正确计算', async () => {
      expect(manager.getActiveCount()).toBe(0);

      const process1 = createMockPtyProcess();
      (mockFactory.spawn as any).mockReturnValue(process1);
      await manager.create(defaultOptions);
      expect(manager.getActiveCount()).toBe(1);

      const process2 = createMockPtyProcess();
      (mockFactory.spawn as any).mockReturnValue(process2);
      await manager.create(defaultOptions);
      expect(manager.getActiveCount()).toBe(2);
    });
  });

  describe('write', () => {
    it('应向指定终端写入数据', async () => {
      const terminalId = await manager.create(defaultOptions);
      manager.write(terminalId, 'hello\r\n');

      expect(mockProcess.write).toHaveBeenCalledWith('hello\r\n');
    });

    it('终端不存在时应抛出错误', () => {
      expect(() => manager.write('non-existent-id', 'data')).toThrow(
        '终端 non-existent-id 不存在或已关闭'
      );
    });
  });

  describe('resize', () => {
    it('应调整指定终端的尺寸', async () => {
      const terminalId = await manager.create(defaultOptions);
      manager.resize(terminalId, 120, 40);

      expect(mockProcess.resize).toHaveBeenCalledWith(120, 40);
    });

    it('终端不存在时应抛出错误', () => {
      expect(() => manager.resize('non-existent-id', 80, 24)).toThrow(
        '终端 non-existent-id 不存在或已关闭'
      );
    });
  });

  describe('destroy', () => {
    it('应终止进程并从管理列表中移除', async () => {
      const terminalId = await manager.create(defaultOptions);
      await manager.destroy(terminalId);

      expect(mockProcess.kill).toHaveBeenCalled();
      expect(manager.getInstance(terminalId)).toBeUndefined();
      expect(manager.getActiveCount()).toBe(0);
    });

    it('终端不存在时应抛出错误', async () => {
      await expect(manager.destroy('non-existent-id')).rejects.toThrow(
        '终端 non-existent-id 不存在或已关闭'
      );
    });

    it('销毁后活跃终端数量应减少', async () => {
      const process1 = createMockPtyProcess();
      (mockFactory.spawn as any).mockReturnValue(process1);
      const id1 = await manager.create(defaultOptions);

      const process2 = createMockPtyProcess();
      (mockFactory.spawn as any).mockReturnValue(process2);
      await manager.create(defaultOptions);

      expect(manager.getActiveCount()).toBe(2);
      await manager.destroy(id1);
      expect(manager.getActiveCount()).toBe(1);
    });
  });

  describe('进程退出事件', () => {
    it('正常退出（退出码 0）应更新状态为 exited', async () => {
      const terminalId = await manager.create(defaultOptions);

      // 模拟进程正常退出
      (mockProcess as any)._emitExit(0);

      const instance = manager.getInstance(terminalId);
      expect(instance!.status).toBe('exited');
      expect(instance!.exitCode).toBe(0);
    });

    it('异常退出（退出码非 0）应更新状态为 error', async () => {
      const terminalId = await manager.create(defaultOptions);

      // 模拟进程异常退出
      (mockProcess as any)._emitExit(1);

      const instance = manager.getInstance(terminalId);
      expect(instance!.status).toBe('error');
      expect(instance!.exitCode).toBe(1);
    });

    it('应发出 exit 事件', async () => {
      const exitHandler = vi.fn();
      manager.on('exit', exitHandler);

      const terminalId = await manager.create(defaultOptions);
      (mockProcess as any)._emitExit(0);

      expect(exitHandler).toHaveBeenCalledWith(terminalId, 0);
    });

    it('退出后 pty 进程引用应被清理', async () => {
      const terminalId = await manager.create(defaultOptions);
      (mockProcess as any)._emitExit(0);

      // 写入应抛出错误（进程已清理）
      expect(() => manager.write(terminalId, 'data')).toThrow();
    });
  });

  describe('数据输出事件', () => {
    it('应发出 data 事件', async () => {
      const dataHandler = vi.fn();
      manager.on('data', dataHandler);

      const terminalId = await manager.create(defaultOptions);
      (mockProcess as any)._emitData('Hello World');

      expect(dataHandler).toHaveBeenCalledWith(terminalId, 'Hello World');
    });
  });

  describe('启动超时处理', () => {
    it('10 秒内未收到数据应标记为 error 并终止进程', async () => {
      vi.useFakeTimers();

      const exitHandler = vi.fn();
      manager.on('exit', exitHandler);

      const terminalId = await manager.create(defaultOptions);

      // 快进 10 秒
      vi.advanceTimersByTime(10000);

      const instance = manager.getInstance(terminalId);
      expect(instance!.status).toBe('error');
      expect(mockProcess.kill).toHaveBeenCalled();
      expect(exitHandler).toHaveBeenCalledWith(terminalId, -1);

      vi.useRealTimers();
    });

    it('收到数据后应清除超时定时器', async () => {
      vi.useFakeTimers();

      const terminalId = await manager.create(defaultOptions);

      // 5 秒后收到数据
      vi.advanceTimersByTime(5000);
      (mockProcess as any)._emitData('data');

      // 再过 6 秒（总共 11 秒），不应触发超时
      vi.advanceTimersByTime(6000);

      const instance = manager.getInstance(terminalId);
      expect(instance!.status).toBe('running');

      vi.useRealTimers();
    });
  });

  describe('destroyAll', () => {
    it('应销毁所有终端', async () => {
      const process1 = createMockPtyProcess();
      const process2 = createMockPtyProcess();

      (mockFactory.spawn as any)
        .mockReturnValueOnce(process1)
        .mockReturnValueOnce(process2);

      await manager.create(defaultOptions);
      await manager.create(defaultOptions);

      expect(manager.getActiveCount()).toBe(2);

      await manager.destroyAll();

      expect(manager.getActiveCount()).toBe(0);
      expect(process1.kill).toHaveBeenCalled();
      expect(process2.kill).toHaveBeenCalled();
    });
  });

  describe('getAllInstances', () => {
    it('应返回所有终端实例', async () => {
      const process1 = createMockPtyProcess();
      const process2 = createMockPtyProcess();

      (mockFactory.spawn as any)
        .mockReturnValueOnce(process1)
        .mockReturnValueOnce(process2);

      await manager.create(defaultOptions, 'cmd');
      await manager.create(defaultOptions, 'powershell');

      const instances = manager.getAllInstances();
      expect(instances).toHaveLength(2);
      expect(instances[0].terminalType).toBe('cmd');
      expect(instances[1].terminalType).toBe('powershell');
    });
  });
});
